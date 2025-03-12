// babel.config.js
export default {
  presets: [['@babel/preset-env', {targets: {node: 'current'}}]],
  plugins: ['@babel/plugin-transform-modules-commonjs']
};