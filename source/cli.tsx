#!/usr/bin/env node
import React from 'react';
import {withFullScreen} from 'fullscreen-ink';
// import meow from 'meow';
import App from './app.js';

// const cli = meow(
// 	`
// 	Usage
// 	  $ gilfoyle

// 	Options
// 		--name  Your name

// 	Examples
// 	  $ gilfoyle --name=Jane
// 	  Hello, Jane
// `,
// 	{
// 		importMeta: import.meta,
// 		flags: {
// 			name: {
// 				type: 'string',
// 			},
// 		},
// 	},
// );

withFullScreen(<App />).start();
