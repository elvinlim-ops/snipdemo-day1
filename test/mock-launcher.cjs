'use strict';

const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');

childProcess.spawn = (command, args) => {
  const child = new EventEmitter();
  process.nextTick(() => {
    const expectedCommand = process.platform === 'win32' ? 'rundll32.exe'
      : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const expectedArgs = process.platform === 'win32'
      ? ['url.dll,FileProtocolHandler', process.env.EXPECTED_TARGET]
      : [process.env.EXPECTED_TARGET];
    if (command !== expectedCommand || JSON.stringify(args) !== JSON.stringify(expectedArgs)) {
      child.emit('error', new Error('Unexpected browser launch arguments'));
    } else {
      child.emit('close', Number(process.env.LAUNCH_EXIT || 0));
    }
  });
  return child;
};
