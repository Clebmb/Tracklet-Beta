import { describe, expect, it } from 'vitest';

import { MENU_KEY_CODES, menuIntent } from '../ui/menuKeys';
import { PIANO_KEY_SEMITONES } from '../model';

/**
 * The menu key table is small, and every claim about it is a claim the help
 * screen makes to a beginner. So it is tested in both directions: the keys the
 * app PROMISES work, and the keys it must leave alone.
 */
describe('menu keys', () => {
  it('moves with the arrows and with WASD', () => {
    expect(menuIntent('ArrowUp')).toBe('up');
    expect(menuIntent('ArrowLeft')).toBe('up');
    expect(menuIntent('ArrowDown')).toBe('down');
    expect(menuIntent('ArrowRight')).toBe('down');

    expect(menuIntent('KeyW')).toBe('up');
    expect(menuIntent('KeyA')).toBe('up');
    expect(menuIntent('KeyS')).toBe('down');
    expect(menuIntent('KeyD')).toBe('down');
  });

  it('jumps to either end with Home and End', () => {
    expect(menuIntent('Home')).toBe('first');
    expect(menuIntent('End')).toBe('last');
  });

  it('picks with Enter or Space, and leaves with Escape', () => {
    expect(menuIntent('Enter')).toBe('pick');
    expect(menuIntent('NumpadEnter')).toBe('pick');
    expect(menuIntent('Space')).toBe('pick');
    expect(menuIntent('Escape')).toBe('close');
  });

  it('ignores every other key', () => {
    for (const code of ['KeyQ', 'KeyZ', 'KeyC', 'Escape_', 'Tab', 'F1', 'F2', 'F9', 'Backspace']) {
      expect(menuIntent(code), code).toBeNull();
    }
  });

  it('never claims a piano key that is not WASD', () => {
    // A menu that swallowed C or Q would eat a note from anyone who opened one
    // mid-bar. Every key that writes a note must be a no-op inside a menu,
    // except the four that a menu can safely borrow.
    const borrowed = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
    for (const code of Object.keys(PIANO_KEY_SEMITONES)) {
      if (borrowed.has(code)) continue;
      expect(menuIntent(code), code).toBeNull();
    }
  });

  it('reports the same key list the lookup answers to', () => {
    // The help screen and the tests enumerate this, so it must not drift from
    // the table itself.
    expect([...MENU_KEY_CODES].sort()).toEqual(
      [
        'ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA',
        'ArrowDown', 'ArrowRight', 'KeyS', 'KeyD',
        'Home', 'End',
        'Enter', 'NumpadEnter', 'Space',
        'Escape',
      ].sort(),
    );
    expect(new Set(MENU_KEY_CODES).size).toBe(MENU_KEY_CODES.length);
  });
});
