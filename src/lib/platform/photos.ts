/**
 * Choosing photos: the system picker (camera or library) through a file input today, the
 * Capacitor Camera plugin in the app. Must be called straight from a tap: browsers open the
 * picker only during a user gesture, so nothing is awaited before the click.
 * Resolves with every chosen file (`max` only says whether several can be chosen: the caller
 * keeps what fits and can tell the user about the rest), or none if the picker was closed.
 */
export function pickPhotos({ max }: { max: number }): Promise<File[]> {
	if (typeof document === 'undefined' || max < 1) return Promise.resolve([]);
	const input = document.createElement('input');
	input.type = 'file';
	// HEIC by extension too: some browsers do not list it under image/*.
	input.accept = 'image/*,.heic,.heif';
	input.multiple = max > 1;
	return new Promise((resolve) => {
		const done = (files: File[]) => {
			input.remove();
			resolve(files);
		};
		input.addEventListener('change', () => done([...(input.files ?? [])]), { once: true });
		input.addEventListener('cancel', () => done([]), { once: true });
		input.click();
	});
}
