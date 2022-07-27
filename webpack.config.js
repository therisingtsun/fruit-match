"use strict";

const { resolve } = require("path");

module.exports = (env) => {
	const mode = env.production ? "production" : "development";
	const watch = !env.production;

	return {
		mode,
		watch,
		entry: {
			server: {
				import: "./src/server/index.ts",
				filename: "index.js"
			}
		},
		output: {
			path: resolve(__dirname, "dist")
		},
		resolve: {
			extensions: [".ts", ".js"]
		},
		module: {
			rules: [
				{
					test: /\.ts$/,
					exclude: /node_modules/,
					use: [
						{
							loader: "ts-loader"
						}
					]
				}
			]
		},
		output: {
			library: {
				type: "commonjs2"
			}
		},
		target: "node"
	};
};