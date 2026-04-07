import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { useClipboard as useClipboardCore, useThrottleFn } from '@vueuse/core';
import { PopOutWindowKey } from '@/app/constants';

type ClipboardEventFn = (data: string, event?: ClipboardEvent) => void;

export function useClipboard({
	onPaste: onPasteFn = () => {},
}: {
	onPaste?: ClipboardEventFn;
} = {}) {
	const popOutWindow = inject(PopOutWindowKey, ref<Window | undefined>());
	const {
		copy: coreCopy,
		copied,
		isSupported,
		text,
	} = useClipboardCore({
		legacy: true,
	});

	// Find the correct navigator at copy-time so it works even when the
	// pop-out window opens after the composable was created.
	async function copy(value: string) {
		const nav = popOutWindow?.value?.navigator;
		if (nav?.clipboard) {
			try {
				await nav.clipboard.writeText(value);
				return;
			} catch {}
		}
		await coreCopy(value);
	}

	// Safari requires navigator.clipboard.write() to be called synchronously
	// within a user gesture. Passing a Promise to ClipboardItem keeps the write
	// call in the gesture context while resolving the text asynchronously.
	async function copyAsync(valuePromise: Promise<string>) {
		const nav = popOutWindow?.value?.navigator;
		const targetClipboard = nav?.clipboard ?? navigator.clipboard;
		if (targetClipboard && typeof ClipboardItem !== 'undefined') {
			const clipboardItem = new ClipboardItem({
				'text/plain': valuePromise.then((value) => new Blob([value], { type: 'text/plain' })),
			});
			await targetClipboard.write([clipboardItem]);
			return;
		}
		// Fallback for environments without ClipboardItem support
		await copy(await valuePromise);
	}

	const ignoreClasses = ['el-messsage-box', 'ignore-key-press-canvas'];
	const initialized = ref(false);

	const onPasteCallback = ref<ClipboardEventFn | null>(onPasteFn || null);

	/**
	 * Handles copy/paste events
	 * @param event
	 */
	function onPaste(event: ClipboardEvent) {
		if (!onPasteCallback.value) {
			return;
		}

		// Check if the event got emitted from a message box or from something
		// else which should ignore the copy/paste
		const path = event.composedPath?.() as HTMLElement[];
		for (const pathElement of path) {
			if (
				pathElement.className &&
				ignoreClasses.some((className) => pathElement.className.includes?.(className))
			) {
				return;
			}
		}

		const clipboardData = event.clipboardData;
		if (clipboardData !== null) {
			const clipboardValue = clipboardData.getData('text/plain');
			onPasteCallback.value(clipboardValue, event);
		}
	}

	const throttledOnPaste = useThrottleFn(onPaste, 1000);

	/**
	 * Initialize copy/paste elements and events
	 */
	onMounted(() => {
		if (initialized.value) {
			return;
		}

		document.addEventListener('paste', throttledOnPaste);

		initialized.value = true;
	});

	/**
	 * Remove copy/paste elements and events
	 */
	onBeforeUnmount(() => {
		if (initialized.value) {
			document.removeEventListener('paste', throttledOnPaste);
		}
	});

	return {
		copy,
		copyAsync,
		copied,
		isSupported,
		text,
		onPaste: onPasteCallback,
	};
}
