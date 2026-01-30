const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const tailwindPlugin = {
  name: 'tailwind',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = await fs.promises.readFile(args.path, 'utf8');
      const result = await postcss([tailwindcss, autoprefixer]).process(css, {
        from: args.path,
      });
      return {
        contents: `
          const style = document.createElement('style');
          style.textContent = ${JSON.stringify(result.css)};
          document.head.appendChild(style);
        `,
        loader: 'js',
      };
    });
  },
};

async function buildWebviews() {
  const webviews = ['sidebar'];

  for (const webview of webviews) {
    const ctx = await esbuild.context({
      entryPoints: [path.join('src', 'webview-ui', webview, 'index.tsx')],
      bundle: true,
      outfile: path.join('out', 'webview-ui', `${webview}.js`),
      minify: production,
      sourcemap: !production,
      platform: 'browser',
      format: 'iife',
      plugins: [tailwindPlugin],
      define: {
        'process.env.NODE_ENV': production ? '"production"' : '"development"',
      },
    });

    if (watch) {
      await ctx.watch();
      console.log(`Watching ${webview}...`);
    } else {
      await ctx.rebuild();
      await ctx.dispose();
      console.log(`Built ${webview}`);
    }
  }
}

buildWebviews().catch((err) => {
  console.error(err);
  process.exit(1);
});
