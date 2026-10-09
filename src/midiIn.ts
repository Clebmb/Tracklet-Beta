/**
 * midiIn — the browser half of a real keyboard: Web MIDI, and the permission it
 * needs.
 *
 * `model/midiIn.ts` decodes messages and does the clock arithmetic; this file is
 * the part that only a browser can do, and it is deliberately thin. It asks for
 * MIDI access, watches the list of inputs, forwards every message as its raw
 * bytes, and reports what it found. Every rule about what a message MEANS lives in
 * the model, so this file has almost nothing worth testing — which is the point.
 *
 * Three decisions are worth stating:
 *
 *   • THE PERMISSION IS ASKED FOR ON PURPOSE, NEVER AT BOOT. A page that pops a
 *     MIDI prompt the moment it loads is a page people deny, and this app has to
 *     work perfectly with no hardware at all. So nothing happens until the user
 *     turns the one control on, and turning it OFF releases the inputs rather
 *     than leaving them subscribed to nothing.
 *
 *   • NO HARDWARE IS NOT AN ERROR. A browser without Web MIDI at all, a machine
 *     with no interface, a person who clicked \"deny\" — all three come back as a
 *     sentence to show, and the app carries on being a tracker. There is nothing
 *     here that throws.
 *
 *   • WHEN THE WEB MIDI TYPES ARE MISSING, WE DECLARE THE SHAPE WE USE. The DOM
 *     types ship `MIDIAccess` only behind a separate lib, so the handful of
 *     members this file touches are declared locally: an app that compiles
 *     everywhere is worth more than one that needs a global type package to say
 *     three property names.
 *
 * `model/midiIn.ts`'s note about the mode being three stops rather than a switch
 * applies here too: this file does not decide WHEN to write a note, only what
 * arrived.
 */

import { decodeMidiIn, type MidiInMessage } from './model/midiIn';

/** One input port, as much of it as this app has any use for. */
interface MidiInputLike {
  id: string;
  name: string | null;
  manufacturer: string | null;
  state?: string;
  onmidimessage: ((event: { data: Uint8Array | null }) => void) | null;
}

interface MidiAccessLike {
  inputs: Map<string, MidiInputLike> | { forEach(callback: (port: MidiInputLike) => void): void };
  onstatechange: ((event: unknown) => void) | null;
}

interface MidiAccessOptions {
  sysex?: boolean;
}

type MidiAccessRequest = (options?: MidiAccessOptions) => Promise<MidiAccessLike>;

/** What the caller hears about. */
export interface MidiListenerHandlers {
  /** One decoded message, in the order it arrived. */
  onMessage: (message: MidiInMessage) => void;
  /** The list of inputs changed — plugged in, unplugged, or first seen. */
  onDevices?: (names: string[]) => void;
}

export interface MidiListener {
  /** The input names the browser listed, in the order they were found. */
  deviceNames: string[];
  /** Stop listening and let go of every port. */
  stop(): void;
}

export type MidiStart =
  | { ok: true; listener: MidiListener }
  | { ok: false; error: string };

/** Does this browser have Web MIDI at all? */
export function midiSupported(): boolean {
  const nav = typeof navigator === 'undefined' ? null : (navigator as unknown as { requestMIDIAccess?: MidiAccessRequest });
  return typeof nav?.requestMIDIAccess === 'function';
}

function inputsOf(access: MidiAccessLike): MidiInputLike[] {
  const list: MidiInputLike[] = [];
  const inputs = access.inputs;
  if (typeof (inputs as Map<string, MidiInputLike>).forEach === 'function') {
    (inputs as Map<string, MidiInputLike>).forEach((port) => { list.push(port); });
  }
  return list;
}

function nameOf(port: MidiInputLike): string {
  const name = (port.name ?? '').trim();
  if (name !== '') return name;
  const maker = (port.manufacturer ?? '').trim();
  return maker !== '' ? `${maker} input` : 'MIDI INPUT';
}

/**
 * Ask for MIDI access and start forwarding messages.
 *
 * Resolves to a listener, or to the single sentence that explains why there is
 * none — the browser refusing, or having no Web MIDI at all. A browser that
 * grants access but has nothing plugged in is a SUCCESS with zero inputs: the
 * app is then listening, and a keyboard plugged in later simply appears (which
 * is what `onstatechange` is for).
 */
export async function startMidiInput(handlers: MidiListenerHandlers): Promise<MidiStart> {
  const nav = typeof navigator === 'undefined' ? null : (navigator as unknown as { requestMIDIAccess?: MidiAccessRequest });
  if (typeof nav?.requestMIDIAccess !== 'function') {
    return { ok: false, error: 'This browser has no Web MIDI, so a keyboard cannot be played into it. Chrome, Edge and Opera have it; Safari and Firefox do not.' };
  }
  let access: MidiAccessLike;
  try {
    // Sysex OFF: nothing here speaks in manufacturer-specific data, and asking
    // for it would turn a one-line permission into a scary one.
    access = await nav.requestMIDIAccess({ sysex: false });
  } catch (error) {
    return {
      ok: false,
      error: `MIDI access was refused: ${error instanceof Error ? error.message : String(error)}. A permission prompt appears the first time; allow it, then turn MIDI on again.`,
    };
  }

  const subscribed = new Map<string, MidiInputLike>();

  const attach = (): string[] => {
    const found = inputsOf(access);
    const ids = new Set(found.map((port) => port.id));
    // Let go of anything that went away, so an unplugged keyboard stops holding
    // a reference (and a replugged one does not fire into two handlers).
    for (const [id, port] of subscribed) {
      if (ids.has(id)) continue;
      port.onmidimessage = null;
      subscribed.delete(id);
    }
    for (const port of found) {
      if (subscribed.has(port.id)) continue;
      port.onmidimessage = (event): void => {
        const message = decodeMidiIn(event.data);
        if (message !== null) handlers.onMessage(message);
      };
      subscribed.set(port.id, port);
    }
    const names = found.map(nameOf);
    handlers.onDevices?.(names);
    return names;
  };

  const names = attach();
  access.onstatechange = (): void => { attach(); };

  return {
    ok: true,
    listener: {
      deviceNames: names,
      stop(): void {
        for (const port of subscribed.values()) port.onmidimessage = null;
        subscribed.clear();
        access.onstatechange = null;
      },
    },
  };
}

/** Convenience for the row: `1 input: KEYS`, or the reason there is none. */
export function midiDeviceSentence(names: readonly string[]): string {
  if (names.length === 0) return 'No MIDI input is connected.';
  return names.length === 1 ? `1 MIDI input: ${names[0]}.` : `${names.length} MIDI inputs: ${names.join(', ')}.`;
}
