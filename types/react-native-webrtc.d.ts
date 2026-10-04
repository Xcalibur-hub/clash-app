declare module 'react-native-webrtc' {
  import type { ComponentType } from 'react';
  import type { ViewProps } from 'react-native';

  export class MediaStreamTrack {
    enabled: boolean;
    kind: string;
    stop(): void;
    _switchCamera?: () => void;
  }

  export class MediaStream {
    id: string;
    toURL(): string;
    getTracks(): MediaStreamTrack[];
    getAudioTracks(): MediaStreamTrack[];
    getVideoTracks(): MediaStreamTrack[];
    addTrack(track: MediaStreamTrack): void;
    release?(keepTracks?: boolean): void;
  }

  export interface RTCSessionDescriptionInit {
    type: 'offer' | 'answer' | 'pranswer' | 'rollback';
    sdp?: string;
  }

  export interface RTCIceCandidateInit {
    candidate?: string;
    sdpMLineIndex?: number | null;
    sdpMid?: string | null;
  }

  export class RTCSessionDescription {
    constructor(init: RTCSessionDescriptionInit);
    type: string;
    sdp: string;
  }

  export class RTCIceCandidate {
    constructor(init: RTCIceCandidateInit);
    candidate: string;
    sdpMLineIndex: number | null;
    sdpMid: string | null;
  }

  export class RTCPeerConnection {
    constructor(config?: { iceServers?: RTCIceServer[] });
    localDescription: RTCSessionDescriptionInit | null;
    remoteDescription: RTCSessionDescriptionInit | null;
    connectionState: string;
    iceConnectionState: string;
    onicecandidate: ((ev: { candidate: RTCIceCandidate | null }) => void) | null;
    ontrack: ((ev: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null;
    onconnectionstatechange: (() => void) | null;
    oniceconnectionstatechange: (() => void) | null;
    addTrack(track: MediaStreamTrack, stream: MediaStream): void;
    createOffer(): Promise<RTCSessionDescriptionInit>;
    createAnswer(): Promise<RTCSessionDescriptionInit>;
    setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void>;
    setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void>;
    addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
    getSenders(): { track: MediaStreamTrack | null; replaceTrack(t: MediaStreamTrack | null): Promise<void> }[];
    close(): void;
  }

  export const mediaDevices: {
    getUserMedia(constraints: {
      audio?: boolean;
      video?: boolean | { facingMode?: 'user' | 'environment' };
    }): Promise<MediaStream>;
    enumerateDevices?(): Promise<unknown[]>;
  };

  export const RTCView: ComponentType<
    ViewProps & {
      streamURL: string;
      mirror?: boolean;
      objectFit?: 'contain' | 'cover';
      zOrder?: number;
    }
  >;

  export function registerGlobals(): void;
}
