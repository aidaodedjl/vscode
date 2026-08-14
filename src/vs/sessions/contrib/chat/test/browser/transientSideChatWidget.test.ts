/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { getTransientSideChatCollapsedPresentation, getTransientSideChatExpandedPresentation, getTransientSideChatResponseHeight, getTransientSideChatStatusAnnouncement, shouldCollapseTransientSideChatFromSourceInput } from '../../browser/transientSideChatWidget.js';

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

	test('explains how to continue from expanded input-needed and error states', () => {
		const needsInput = getTransientSideChatExpandedPresentation(SessionStatus.NeedsInput);
		const error = getTransientSideChatExpandedPresentation(SessionStatus.Error);

		assert.deepStrictEqual({ needsInput, error }, {
			needsInput: {
				statusLabel: 'Input needed. Open the full chat to continue.',
				promoteLabel: 'Open Full Chat to Continue',
				className: 'needs-input',
			},
			error: {
				statusLabel: 'The side question failed. Open the full chat for details.',
				promoteLabel: 'Open Full Chat for Details',
				className: 'error',
			},
		});
	});

	test('uses natural response height up to a view-relative cap', () => {
		assert.deepStrictEqual({
			shortAnswer: getTransientSideChatResponseHeight(1000, 28),
			tallAnswer: getTransientSideChatResponseHeight(1000, 500),
			shortView: getTransientSideChatResponseHeight(400, 500),
			empty: getTransientSideChatResponseHeight(1000, 0),
		}, {
			shortAnswer: 28,
			tallAnswer: 320,
			shortView: 128,
			empty: 1,
		});
	});

	test('announces side-question creation and terminal answer transitions once', () => {
		assert.deepStrictEqual({
			created: getTransientSideChatStatusAnnouncement(undefined, SessionStatus.InProgress, true),
			completed: getTransientSideChatStatusAnnouncement(SessionStatus.InProgress, SessionStatus.Completed, false),
			failed: getTransientSideChatStatusAnnouncement(SessionStatus.InProgress, SessionStatus.Error, false),
			stillWorking: getTransientSideChatStatusAnnouncement(SessionStatus.InProgress, SessionStatus.InProgress, false),
			alreadyComplete: getTransientSideChatStatusAnnouncement(SessionStatus.Completed, SessionStatus.Completed, false),
		}, {
			created: 'Side question asked',
			completed: 'Side question answered',
			failed: 'Side question failed',
			stillWorking: undefined,
			alreadyComplete: undefined,
		});
	});

	test('defers source-input Escape to active input interactions', () => {
		const idle = {
			expanded: true,
			defaultPrevented: false,
			confirmationVisible: false,
			suggestVisible: false,
			hoverVisible: false,
			requestInProgress: false,
			speechToTextRecording: false,
			currentlyEditing: false,
		};

		assert.deepStrictEqual({
			idle: shouldCollapseTransientSideChatFromSourceInput(idle),
			suggest: shouldCollapseTransientSideChatFromSourceInput({ ...idle, suggestVisible: true }),
			confirmation: shouldCollapseTransientSideChatFromSourceInput({ ...idle, confirmationVisible: true }),
			request: shouldCollapseTransientSideChatFromSourceInput({ ...idle, requestInProgress: true }),
			dictation: shouldCollapseTransientSideChatFromSourceInput({ ...idle, speechToTextRecording: true }),
			editing: shouldCollapseTransientSideChatFromSourceInput({ ...idle, currentlyEditing: true }),
		}, {
			idle: true,
			suggest: false,
			confirmation: false,
			request: false,
			dictation: false,
			editing: false,
		});
	});
});
