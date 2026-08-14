/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { getTransientSideChatCollapsedPresentation } from '../../browser/transientSideChatWidget.js';

suite('TransientSideChatWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('distinguishes collapsed input-needed and error states without color alone', () => {
		const needsInput = getTransientSideChatCollapsedPresentation(SessionStatus.NeedsInput);
		const error = getTransientSideChatCollapsedPresentation(SessionStatus.Error);

		assert.deepStrictEqual({
			needsInput: { label: needsInput.label, icon: needsInput.icon.id, className: needsInput.className },
			error: { label: error.label, icon: error.icon.id, className: error.className },
		}, {
			needsInput: { label: 'Side question · Input Needed', icon: 'warning', className: 'needs-input' },
			error: { label: 'Side question · Failed', icon: 'error', className: 'error' },
		});
	});
});
