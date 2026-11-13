/**
 * expo-linear-gradient shim for the AURA render check.
 *
 * `Avatar` draws its accent with a native gradient. The package ships JSX in
 * `build/*.js`, and a gradient is a paint concern that static markup cannot
 * verify anyway — so it is replaced with a plain view. This keeps the probe able
 * to see that the avatar *mounted* without pretending to check the gradient.
 */
const React = require('react');

const LinearGradient = React.forwardRef(function LinearGradient(props, ref) {
  const { children, colors, start, end, ...rest } = props;
  return React.createElement('View', { ref, 'data-gradient': String(colors ?? ''), ...rest }, children);
});
LinearGradient.displayName = 'LinearGradient';

module.exports = { LinearGradient, default: LinearGradient };
