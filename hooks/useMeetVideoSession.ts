/**
 * Centralized Meet VIDEO WebRTC lifecycle.
 * Owns local/remote streams, peer connection, signaling poll, cleanup.
 */
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  fetchMeetIceServers,
  fetchMeetSession,
  listMeetSignals,
  publishMeetSignal,
  type MeetSession,
} from '../services/meetService';
import {
  reduceMeetVideoState,
  shouldApplySignal,
  type MeetVideoConnState,
} from '../utils/meetVideoSession';

type WebRTC = typeof import('react-native-webrtc');

let webrtcMod: WebRTC | null = null;

function loadWebRTC(): WebRTC {
  if (!webrtcMod) {
    // Native-only; requires custom dev client rebuild after install.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webrtcMod = require('react-native-webrtc') as WebRTC;
    webrtcMod.registerGlobals?.();
  }
  return webrtcMod;
}

export interface MeetVideoSessionApi {
  state: MeetVideoConnState;
  session: MeetSession | null;
  localStreamUrl: string | null;
  remoteStreamUrl: string | null;
  micOn: boolean;
  cameraOn: boolean;
  facing: 'user' | 'environment';
  hasTurn: boolean;
  error: string | null;
  start: () => Promise<void>;
  toggleMic: () => void;
  toggleCamera: () => void;
  flipCamera: () => void;
  cleanup: () => void;
}

export function useMeetVideoSession(sessionId: string): MeetVideoSessionApi {
  const [state, setState] = React.useState<MeetVideoConnState>('idle');
  const [session, setSession] = React.useState<MeetSession | null>(null);
  const [localStreamUrl, setLocalStreamUrl] = React.useState<string | null>(null);
  const [remoteStreamUrl, setRemoteStreamUrl] = React.useState<string | null>(null);
  const [micOn, setMicOn] = React.useState(true);
  const [cameraOn, setCameraOn] = React.useState(true);
  const [facing, setFacing] = React.useState<'user' | 'environment'>('user');
  const [hasTurn, setHasTurn] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const stateRef = React.useRef<MeetVideoConnState>('idle');
  const pcRef = React.useRef<InstanceType<WebRTC['RTCPeerConnection']> | null>(null);
  const localRef = React.useRef<InstanceType<WebRTC['MediaStream']> | null>(null);
  const remoteRef = React.useRef<InstanceType<WebRTC['MediaStream']> | null>(null);
  const seenRef = React.useRef(new Set<string>());
  const afterRef = React.useRef<number | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanedRef = React.useRef(false);
  const makingOfferRef = React.useRef(false);

  const transition = React.useCallback((event: Parameters<typeof reduceMeetVideoState>[1]) => {
    const next = reduceMeetVideoState(stateRef.current, event);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const stopPoll = React.useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (sessionPollRef.current) {
      clearInterval(sessionPollRef.current);
      sessionPollRef.current = null;
    }
  }, []);

  const cleanup = React.useCallback(() => {
    if (cleanedRef.current) {
      transition('cleanup');
      return;
    }
    cleanedRef.current = true;
    stopPoll();
    try {
      pcRef.current?.close();
    } catch {
      /* ignore */
    }
    pcRef.current = null;
    const local = localRef.current;
    if (local) {
      for (const track of local.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
      try {
        local.release?.(true);
      } catch {
        /* ignore */
      }
    }
    localRef.current = null;
    remoteRef.current = null;
    setLocalStreamUrl(null);
    setRemoteStreamUrl(null);
    transition('cleanup');
  }, [stopPoll, transition]);

  const applySignal = React.useCallback(
    async (signal: {
      id: string;
      kind: 'offer' | 'answer' | 'ice';
      payload: Record<string, unknown>;
      createdAt: number;
    }) => {
      if (!shouldApplySignal(seenRef.current, signal.id)) return;
      seenRef.current.add(signal.id);
      afterRef.current = Math.max(afterRef.current ?? 0, signal.createdAt);

      const pc = pcRef.current;
      if (!pc) return;
      const { RTCIceCandidate } = loadWebRTC();

      try {
        if (signal.kind === 'offer') {
          const sdp = typeof signal.payload.sdp === 'string' ? signal.payload.sdp : null;
          if (!sdp || signal.payload.type !== 'offer') return;
          await pc.setRemoteDescription({ type: 'offer', sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await publishMeetSignal(sessionId, 'answer', {
            type: answer.type,
            sdp: answer.sdp,
          });
          transition('remote_signal');
        } else if (signal.kind === 'answer') {
          const sdp = typeof signal.payload.sdp === 'string' ? signal.payload.sdp : null;
          if (!sdp) return;
          await pc.setRemoteDescription({ type: 'answer', sdp });
          transition('remote_signal');
        } else if (signal.kind === 'ice') {
          await pc.addIceCandidate(
            new RTCIceCandidate({
              candidate: typeof signal.payload.candidate === 'string' ? signal.payload.candidate : '',
              sdpMid: typeof signal.payload.sdpMid === 'string' ? signal.payload.sdpMid : null,
              sdpMLineIndex:
                typeof signal.payload.sdpMLineIndex === 'number'
                  ? signal.payload.sdpMLineIndex
                  : null,
            }),
          );
        }
      } catch {
        setError('Connection failed');
        transition('fail');
      }
    },
    [sessionId, transition],
  );

  const start = React.useCallback(async () => {
    if (stateRef.current !== 'idle' && stateRef.current !== 'ended' && stateRef.current !== 'failed') {
      return;
    }
    cleanedRef.current = false;
    setError(null);
    transition('start');
    try {
      const webrtc = loadWebRTC();
      const sess = await fetchMeetSession(sessionId);
      setSession(sess);
      if (sess.channel !== 'VIDEO' || sess.status !== 'active') {
        throw new Error('Video session unavailable');
      }

      const ice = await fetchMeetIceServers();
      setHasTurn(ice.hasTurn);

      const local = await webrtc.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user' },
      });
      localRef.current = local;
      setLocalStreamUrl(local.toURL());
      setFacing('user');
      setMicOn(true);
      setCameraOn(true);
      transition('local_ready');

      const pc = new webrtc.RTCPeerConnection({ iceServers: ice.iceServers });
      pcRef.current = pc;

      for (const track of local.getTracks()) {
        pc.addTrack(track, local);
      }

      pc.onicecandidate = (ev) => {
        if (!ev.candidate?.candidate) return;
        void publishMeetSignal(sessionId, 'ice', {
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
        }).catch(() => undefined);
      };

      pc.ontrack = (ev) => {
        const stream = ev.streams[0];
        if (!stream) return;
        remoteRef.current = stream;
        setRemoteStreamUrl(stream.toURL());
      };

      pc.onconnectionstatechange = () => {
        const cs = pc.connectionState;
        if (cs === 'connected') transition('ice_connected');
        else if (cs === 'failed') {
          setError('Connection failed');
          transition('fail');
        } else if (cs === 'disconnected') transition('ice_disconnected');
      };

      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        if (iceState === 'connected' || iceState === 'completed') transition('ice_connected');
        else if (iceState === 'failed') {
          setError('Connection failed');
          transition('fail');
        } else if (iceState === 'disconnected') transition('ice_disconnected');
      };

      if (sess.isOfferer && !makingOfferRef.current) {
        makingOfferRef.current = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await publishMeetSignal(sessionId, 'offer', {
          type: offer.type,
          sdp: offer.sdp,
        });
      }

      pollRef.current = setInterval(() => {
        void listMeetSignals(sessionId, afterRef.current).then(async (res) => {
          if (!res.active) {
            transition('peer_left');
            return;
          }
          for (const item of res.items) {
            await applySignal(item);
          }
        });
      }, 500);

      sessionPollRef.current = setInterval(() => {
        void fetchMeetSession(sessionId)
          .then((s) => {
            setSession(s);
            if (s.status === 'ended' || !s.peerConnected) transition('peer_left');
          })
          .catch(() => undefined);
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start video');
      transition('fail');
      cleanup();
      cleanedRef.current = false;
    }
  }, [applySignal, cleanup, sessionId, transition]);

  const toggleMic = React.useCallback(() => {
    const local = localRef.current;
    if (!local) return;
    const next = !micOn;
    for (const track of local.getAudioTracks()) track.enabled = next;
    setMicOn(next);
  }, [micOn]);

  const toggleCamera = React.useCallback(() => {
    const local = localRef.current;
    if (!local) return;
    const next = !cameraOn;
    for (const track of local.getVideoTracks()) track.enabled = next;
    setCameraOn(next);
  }, [cameraOn]);

  const flipCamera = React.useCallback(() => {
    const local = localRef.current;
    if (!local) return;
    const track = local.getVideoTracks()[0];
    if (!track?._switchCamera) return;
    track._switchCamera();
    setFacing((f) => (f === 'user' ? 'environment' : 'user'));
  }, []);

  React.useEffect(() => {
    const onApp = (status: AppStateStatus) => {
      const local = localRef.current;
      if (!local) return;
      if (status !== 'active') {
        for (const track of local.getTracks()) track.enabled = false;
      } else {
        for (const track of local.getAudioTracks()) track.enabled = micOn;
        for (const track of local.getVideoTracks()) track.enabled = cameraOn;
      }
    };
    const sub = AppState.addEventListener('change', onApp);
    return () => sub.remove();
  }, [cameraOn, micOn]);

  React.useEffect(
    () => () => {
      cleanup();
    },
    [cleanup],
  );

  return {
    state,
    session,
    localStreamUrl,
    remoteStreamUrl,
    micOn,
    cameraOn,
    facing,
    hasTurn,
    error,
    start,
    toggleMic,
    toggleCamera,
    flipCamera,
    cleanup,
  };
}
