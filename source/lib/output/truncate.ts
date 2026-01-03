/**
 * Truncation utilities for CLI output
 */

export type TruncateOptions = {
	maxLength?: number;
	maxLines?: number;
	indicator?: string;
};

const defaults = {
	maxLength: 500,
	maxLines: 10,
	indicator: '... [truncated]',
} as const;

/**
 * Truncate text by line count
 */
function truncateByLines(
	input: string,
	maxLines: number,
	indicator: string,
): {text: string; wasTruncated: boolean} {
	const lines = input.split('\n');

	if (lines.length <= maxLines) {
		return {text: input, wasTruncated: false};
	}

	const truncated = lines.slice(0, maxLines).join('\n') + '\n' + indicator;
	return {text: truncated, wasTruncated: true};
}

/**
 * Truncate text by character count
 */
function truncateByLength(
	input: string,
	maxLength: number,
	indicator: string,
): {text: string; wasTruncated: boolean} {
	if (input.length <= maxLength) {
		return {text: input, wasTruncated: false};
	}

	const allowedLength = maxLength - indicator.length;

	if (allowedLength <= 0) {
		return {text: indicator, wasTruncated: true};
	}

	const truncated = input.slice(0, allowedLength) + indicator;
	return {text: truncated, wasTruncated: true};
}

/**
 * Truncate text by both line count and character count
 * Applies line truncation first, then character truncation
 */
export function truncate(
	input: string,
	options: TruncateOptions = {},
): {text: string; wasTruncated: boolean} {
	const maxLength = options.maxLength ?? defaults.maxLength;
	const maxLines = options.maxLines ?? defaults.maxLines;
	const indicator = options.indicator ?? defaults.indicator;

	// Apply line truncation first
	const result = truncateByLines(input, maxLines, indicator);

	// Then apply character truncation
	if (result.text.length > maxLength) {
		const charResult = truncateByLength(result.text, maxLength, indicator);
		return {
			text: charResult.text,
			wasTruncated: result.wasTruncated || charResult.wasTruncated,
		};
	}

	return result;
}
