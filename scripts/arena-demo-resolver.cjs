const path = require('node:path');
/** Metro's installed ResolutionContext exposes dev. Missing/false fails closed. */
exports.withArenaDemoGuard = (previous, root) => (context, name, platform) => {
  if (name.replaceAll('\\', '/').endsWith('/arenaDemo/entry') && context.dev !== true) {
    return { type: 'sourceFile', filePath: path.join(root, 'components/dev/arenaDemo/Disabled.tsx') };
  }
  return previous ? previous(context, name, platform) : context.resolveRequest(context, name, platform);
};
