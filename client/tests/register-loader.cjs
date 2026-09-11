const { register } = require('node:module');
const { pathToFileURL } = require('node:url');
register('./loader.mjs', pathToFileURL(__filename));
