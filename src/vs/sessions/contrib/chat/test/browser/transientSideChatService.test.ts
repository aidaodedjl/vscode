/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ITransientSideChatHost, TransientSideChatService } from '../../browser/transientSideChatService.js';

suite('TransientSideChatService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const sourceChat = upcastPartial<IChat>({
		resource: URI.parse('test:///chat/source'),
		title: constObservable('Source Chat'),
	});
	const sideChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') });
	const session = upcastPartial<ISession>({
		sessionId: 'session',
		resource: URI.parse('test:///session'),
	});

	function setup() {
		const calls: string[] = [];
		const sessionsService = upcastPartial<ISessionsService>({
			closeChat: async (_session, chat, options) => {
				calls.push(`close:${chat.resource.toString()}:${options?.skipHistory}`);
			},
			openChat: async (_session, chatResource) => {
				calls.push(`open:${chatResource.toString()}`);
			},
		});
		const managementService = upcastPartial<ISessionsManagementService>({ onDidDeleteSession: Event.None });
		return { service: disposables.add(new TransientSideChatService(sessionsService, managementService)), calls };
	}

	test('falls back when the source chat has no live host', async () => {
		const { service, calls } = setup();

		assert.deepStrictEqual({
			shown: await service.show(session, sourceChat, sideChat, 'question'),
			states: service.states.get(),
			calls,
		}, {
			shown: false,
			states: [],
			calls: [],
		});
	});

	test('hides, expands, collapses, and promotes through the normal chat path', async () => {
		const { service, calls } = setup();
		const host = upcastPartial<ITransientSideChatHost>({ revealSource: () => true });
		disposables.add(service.registerHost(sourceChat.resource, host));

		const shown = await service.show(session, sourceChat, sideChat, 'question');
		service.collapse(sourceChat.resource);
		const collapsed = service.states.get()[0];
		service.expand(sourceChat.resource);
		const expanded = service.states.get()[0];
		await service.promote(sourceChat.resource);

		assert.deepStrictEqual({
			shown,
			collapsed: { question: collapsed?.question, expanded: collapsed?.expanded, promoting: collapsed?.promoting },
			expanded: { question: expanded?.question, expanded: expanded?.expanded, promoting: expanded?.promoting },
			states: service.states.get(),
			calls,
		}, {
			shown: true,
			collapsed: { question: 'question', expanded: false, promoting: false },
			expanded: { question: 'question', expanded: true, promoting: false },
			states: [],
			calls: [
				`close:${sideChat.resource.toString()}:true`,
				`open:${sideChat.resource.toString()}`,
			],
		});
	});

	test('clears transient state when the side chat opens through another surface', async () => {
		const { service } = setup();
		disposables.add(service.registerHost(sourceChat.resource, upcastPartial<ITransientSideChatHost>({ revealSource: () => true })));
		await service.show(session, sourceChat, sideChat, 'question');

		service.removeBySideChat(sideChat.resource);

		assert.deepStrictEqual(service.states.get(), []);
	});

	test('routes source reveal to the registered source view', async () => {
		const { service } = setup();
		let revealCalls = 0;
		disposables.add(service.registerHost(sourceChat.resource, upcastPartial<ITransientSideChatHost>({
			revealSource: () => {
				revealCalls++;
				return true;
			},
		})));
		await service.show(session, sourceChat, sideChat, 'question');

		assert.deepStrictEqual({
			revealed: service.revealSource(sideChat.resource),
			revealCalls,
		}, {
			revealed: true,
			revealCalls: 1,
		});
	});
});
