/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ITransientSideChatService, ITransientSideChatState } from '../../browser/transientSideChatService.js';
import { getTransientSideChatCollapsedPresentation, getTransientSideChatExpandedPresentation, getTransientSideChatResponseHeight, getTransientSideChatStatusAnnouncement, hasTransientSideChatResponseStarted, shouldCollapseTransientSideChatFromSourceInput, shouldShowTransientSideChatProgress, TransientSideChatWidget } from '../../browser/transientSideChatWidget.js';

suite('TransientSideChatWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
			shortAnswer: getTransientSideChatResponseHeight(1000, 28, 50),
			tallAnswer: getTransientSideChatResponseHeight(1000, 700, 50),
			shortView: getTransientSideChatResponseHeight(400, 500, 50),
			empty: getTransientSideChatResponseHeight(1000, 0, 50),
		}, {
			shortAnswer: 28,
			tallAnswer: 550,
			shortView: 190,
			empty: 1,
		});
	});

	test('shows fallback progress only until renderable response content arrives', () => {
		assert.deepStrictEqual({
			initialCompleted: shouldShowTransientSideChatProgress(SessionStatus.Completed, true),
			working: shouldShowTransientSideChatProgress(SessionStatus.InProgress, true),
			contentAlreadyObserved: shouldShowTransientSideChatProgress(SessionStatus.InProgress, false),
			needsInput: shouldShowTransientSideChatProgress(SessionStatus.NeedsInput, true),
			noBaseline: hasTransientSideChatResponseStarted(undefined, 38),
			structuralRowUnchanged: hasTransientSideChatResponseStarted(10, 10),
			responseGrew: hasTransientSideChatResponseStarted(10, 38),
		}, {
			initialCompleted: true,
			working: true,
			contentAlreadyObserved: false,
			needsInput: false,
			noBaseline: false,
			structuralRowUnchanged: false,
			responseGrew: true,
		});
	});

	test('announces side-question creation and terminal answer transitions once', () => {
		assert.deepStrictEqual({
			created: getTransientSideChatStatusAnnouncement(undefined, SessionStatus.InProgress, true, false),
			replaced: getTransientSideChatStatusAnnouncement(undefined, SessionStatus.InProgress, true, true),
			completed: getTransientSideChatStatusAnnouncement(SessionStatus.InProgress, SessionStatus.Completed, false, false),
			failed: getTransientSideChatStatusAnnouncement(SessionStatus.InProgress, SessionStatus.Error, false, false),
			stillWorking: getTransientSideChatStatusAnnouncement(SessionStatus.InProgress, SessionStatus.InProgress, false, false),
			alreadyComplete: getTransientSideChatStatusAnnouncement(SessionStatus.Completed, SessionStatus.Completed, false, false),
		}, {
			created: 'Side question asked',
			replaced: 'New side question shown. The previous answer remains in Closed chats.',
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

	test('expansion leaves the source composer mounted and exposes only answer-card actions', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IHoverService, upcastPartial<IHoverService>({
			setupManagedHover: () => ({
				dispose: () => undefined,
				show: () => undefined,
				hide: () => undefined,
				update: () => undefined,
			}),
		}));

		const states = observableValue<readonly ITransientSideChatState[]>(disposables, []);
		instantiationService.stub(ITransientSideChatService, upcastPartial<ITransientSideChatService>({
			states,
			registerHost: () => toDisposable(() => undefined),
			removeBySideChat: () => undefined,
		}));

		const document = dom.getActiveDocument();
		const composer = dom.append(document.body, dom.$('.source-composer'));
		disposables.add(toDisposable(() => composer.remove()));
		const persistentContent = dom.append(composer, dom.$('.source-persistent-content'));
		const sourceEditor = dom.append(composer, dom.$('.source-editor'));
		const sourceWidget = {
			inputEditor: upcastPartial<ICodeEditor>({
				getDomNode: () => sourceEditor,
				hasTextFocus: () => false,
			}),
			inputPart: { hasActiveToolConfirmationCarousel: false },
			focusInput: () => undefined,
		};
		const widget = disposables.add(instantiationService.createInstance(TransientSideChatWidget, persistentContent, sourceWidget));
		Reflect.set(widget, '_ensureSideModel', () => undefined);

		const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///source') });
		const sideChat = upcastPartial<IChat>({
			resource: URI.parse('test:///side'),
			status: constObservable(SessionStatus.Completed),
		});
		const session = upcastPartial<ISession>({ sessionId: 'session' });
		widget.setSource(sourceChat, session);
		const state: ITransientSideChatState = {
			session,
			sourceChat,
			sideChat,
			question: 'What changed?',
			expanded: true,
			promoting: false,
			sendFailed: false,
			replacedExisting: false,
		};
		states.set([state], undefined);

		const card = persistentContent.querySelector<HTMLElement>('.transient-side-chat-card');
		const actionLabels = [...persistentContent.querySelectorAll<HTMLElement>('.transient-side-chat-actions [aria-label]')]
			.map(element => element.getAttribute('aria-label'));
		const expandedCardHidden = card?.classList.contains('hidden');
		const progressVisibleWhileWorking = !persistentContent.querySelector('.transient-side-chat-progress')?.classList.contains('hidden');
		states.set([{ ...state, sendFailed: true }], undefined);
		const progressHiddenAfterFailure = persistentContent.querySelector('.transient-side-chat-progress')?.classList.contains('hidden');
		states.set([{ ...state, expanded: false, sendFailed: true }], undefined);
		const collapsedButton = persistentContent.querySelector<HTMLElement>('.transient-side-chat-collapsed');

		assert.deepStrictEqual({
			sourceEditorMounted: composer.contains(sourceEditor),
			sourceEditorDisplay: sourceEditor.style.display,
			expandedCardHidden,
			question: card?.querySelector('.transient-side-chat-question')?.textContent,
			actionLabels,
			progressVisibleWhileWorking,
			progressHiddenAfterFailure,
			nestedComposerCount: persistentContent.querySelectorAll('.transient-side-chat-widget .interactive-input-part:not(.chat-input-hidden)').length,
			collapsedExpanded: collapsedButton?.getAttribute('aria-expanded'),
			collapsedControlsCard: collapsedButton?.getAttribute('aria-controls') === card?.id,
		}, {
			sourceEditorMounted: true,
			sourceEditorDisplay: '',
			expandedCardHidden: false,
			question: 'What changed?',
			actionLabels: ['Side question actions', 'Open Full Chat', 'Close Side Question'],
			progressVisibleWhileWorking: true,
			progressHiddenAfterFailure: true,
			nestedComposerCount: 0,
			collapsedExpanded: 'false',
			collapsedControlsCard: true,
		});
	});
});
