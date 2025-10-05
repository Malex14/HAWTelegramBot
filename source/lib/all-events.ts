import {readFile, watch} from 'node:fs/promises';
import type {
	EventDirectory, EventId, Events, EventSearchResult,
} from './types.ts';

const DIRECTORY_FILE = 'eventfiles/directory.json';

const directory = await loadDirectory();
const namesOfEvents: Record<string, string> = await generateMapping();

async function watchForDirectoryChanges() {
	const watcher = watch(DIRECTORY_FILE);
	for await (const event of watcher) {
		console.log(event);
		if (event.eventType === 'change') {
			await loadDirectory();
			await generateMapping();
		}
	}
}

await watchForDirectoryChanges();

async function loadDirectory(): Promise<EventDirectory> {
	const directoryString = await readFile(DIRECTORY_FILE);
	const directory = JSON.parse(directoryString.toString()) as EventDirectory;
	return directory;
}

async function generateMapping(): Promise<Record<string, string>> {
	const namesOfEvents: Record<string, string> = {};

	function collect(directory: EventDirectory) {
		for (const subDirectory of Object.values(directory.subDirectories ?? {})) {
			collect(subDirectory);
		}

		Object.assign(namesOfEvents, directory.events ?? {});
	}

	collect(directory);

	return namesOfEvents;
}

function resolvePath(path: string[]): EventDirectory {
	let resolvedDirectory = directory;

	for (const part of path) {
		if (resolvedDirectory.subDirectories === undefined || !(part in resolvedDirectory.subDirectories)) {
			throw new Error('Ungültiger Pfad');
		}

		resolvedDirectory = resolvedDirectory.subDirectories[part]!;
	}

	return resolvedDirectory;
}

export function getEventName(id: EventId): string {
	return namesOfEvents[id] ?? id;
}

export function count(): number {
	return Object.keys(namesOfEvents).length;
}

export function nonExisting(ids: readonly EventId[]): readonly EventId[] {
	return ids.filter(id => !(id in namesOfEvents));
}

export function find(
	pattern: string | RegExp | undefined,
	startAt: string[] = [],
): Readonly<EventSearchResult> {
	if (pattern !== undefined) {
		const regex = new RegExp(pattern, 'i');
		const accumulator: Events = {};

		function collect(directory: EventDirectory) {
			for (const [eventId, name] of Object.entries(directory.events ?? {})) {
				if (regex.test(name)) {
					accumulator[eventId as EventId] = name;
				}
			}

			for (const subDirectory of Object.values(directory.subDirectories ?? {})) {
				collect(subDirectory);
			}
		}

		collect(resolvePath(startAt));

		return {
			subDirectories: {},
			events: Object.fromEntries(Object.entries(accumulator).sort((a, b) => a[1].localeCompare(b[1]))),
		};
	}

	const directory = resolvePath(startAt);

	return {
		subDirectories: Object.fromEntries(Object.entries(directory.subDirectories ?? {})
			.map(([name, directory]) => [name, [directory, [...startAt, name]]])),
		events: directory.events ?? {},
	};
}
