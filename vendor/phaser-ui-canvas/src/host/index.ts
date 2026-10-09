/**
 * host — the contract with whatever launched this app.
 *
 * `launch` is the Phaser-free half: parse the two query parameters a launcher
 * hands over, and know the way back. `HostExitPrompt` is the widget every editor
 * in a kit wants: one Escape that asks "leave?" instead of obeying.
 *
 *   import { readLaunch, HostExitPrompt } from './host';
 *   const launch = readLaunch(location.search, 'doodadarium');
 *   const exit = launch ? new HostExitPrompt(scene, launch) : null;
 */
export * from './launch';
export * from './HostExitPrompt';
