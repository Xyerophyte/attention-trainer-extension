module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current',
        chrome: '88'
      },
      modules: 'commonjs',
      useBuiltIns: 'usage',
      corejs: 3
    }]
  ],
  plugins: [
    '@babel/plugin-proposal-optional-chaining',
    '@babel/plugin-proposal-nullish-coalescing-operator'
  ],
  env: {
    test: {
      presets: [
        ['@babel/preset-env', {
          targets: {
            node: 'current'
          },
          modules: 'commonjs'
        }]
      ]
    }
  }
};
