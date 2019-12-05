/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IExtensionIdentifier } from 'vs/platform/extensionManagement/common/extensionManagement';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, allSettings } from 'vs/platform/configuration/common/configurationRegistry';
import { localize } from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ILogService } from 'vs/platform/log/common/log';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStringDictionary } from 'vs/base/common/collections';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { URI } from 'vs/base/common/uri';

const CONFIGURATION_SYNC_STORE_KEY = 'configurationSync.store';

export const DEFAULT_IGNORED_SETTINGS = [
	CONFIGURATION_SYNC_STORE_KEY,
	'sync.enable',
	'sync.enableSettings',
	'sync.enableExtensions',
];

export function registerConfiguration(): IDisposable {
	const ignoredSettingsSchemaId = 'vscode://schemas/ignoredSettings';
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	configurationRegistry.registerConfiguration({
		id: 'sync',
		order: 30,
		title: localize('sync', "Sync"),
		type: 'object',
		properties: {
			'sync.enable': {
				type: 'boolean',
				description: localize('sync.enable', "Enable synchronization."),
				default: false,
				scope: ConfigurationScope.APPLICATION
			},
			'sync.enableSettings': {
				type: 'boolean',
				description: localize('sync.enableSettings', "Enable synchronizing settings."),
				default: true,
				scope: ConfigurationScope.APPLICATION,
			},
			'sync.enableExtensions': {
				type: 'boolean',
				description: localize('sync.enableExtensions', "Enable synchronizing extensions."),
				default: true,
				scope: ConfigurationScope.APPLICATION,
			},
			'sync.enableKeybindings': {
				type: 'boolean',
				description: localize('sync.enableKeybindings', "Enable synchronizing keybindings."),
				default: true,
				scope: ConfigurationScope.APPLICATION,
			},
			'sync.keybindingsPerPlatform': {
				type: 'boolean',
				description: localize('sync.keybindingsPerPlatform', "Synchronize keybindings per platform."),
				default: true,
				scope: ConfigurationScope.APPLICATION,
			},
			'sync.ignoredExtensions': {
				'type': 'array',
				description: localize('sync.ignoredExtensions', "Configure extensions to be ignored while synchronizing."),
				'default': [],
				'scope': ConfigurationScope.APPLICATION,
				uniqueItems: true
			},
			'sync.ignoredSettings': {
				'type': 'array',
				description: localize('sync.ignoredSettings', "Configure settings to be ignored while synchronizing. \nDefault Ignored Settings:\n\n{0}", DEFAULT_IGNORED_SETTINGS.sort().map(setting => `- ${setting}`).join('\n')),
				'default': [],
				'scope': ConfigurationScope.APPLICATION,
				$ref: ignoredSettingsSchemaId,
				additionalProperties: true,
				uniqueItems: true
			}
		}
	});
	const registerIgnoredSettingsSchema = () => {
		const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
		const ignoredSettingsSchema: IJSONSchema = {
			items: {
				type: 'string',
				enum: [...Object.keys(allSettings.properties).filter(setting => DEFAULT_IGNORED_SETTINGS.indexOf(setting) === -1), ...DEFAULT_IGNORED_SETTINGS.map(setting => `-${setting}`)]
			}
		};
		jsonRegistry.registerSchema(ignoredSettingsSchemaId, ignoredSettingsSchema);
	};
	return configurationRegistry.onDidUpdateConfiguration(() => registerIgnoredSettingsSchema());
}

export interface IUserData {
	ref: string;
	content: string | null;
}

export enum UserDataSyncStoreErrorCode {
	Unauthroized = 'Unauthroized',
	Rejected = 'Rejected',
	Unknown = 'Unknown'
}

export class UserDataSyncStoreError extends Error {

	constructor(message: string, public readonly code: UserDataSyncStoreErrorCode) {
		super(message);
	}

}

export interface IUserDataSyncStore {
	url: string;
	name: string;
	account: string;
}

export function getUserDataSyncStore(configurationService: IConfigurationService): IUserDataSyncStore | undefined {
	const value = configurationService.getValue<IUserDataSyncStore>(CONFIGURATION_SYNC_STORE_KEY);
	return value && value.url && value.name && value.account ? value : undefined;
}

export const IUserDataSyncStoreService = createDecorator<IUserDataSyncStoreService>('IUserDataSyncStoreService');

export interface IUserDataSyncStoreService {
	_serviceBrand: undefined;

	readonly userDataSyncStore: IUserDataSyncStore | undefined;

	read(key: string, oldValue: IUserData | null): Promise<IUserData>;
	write(key: string, content: string, ref: string | null): Promise<string>;
}

export interface ISyncExtension {
	identifier: IExtensionIdentifier;
	version?: string;
	enabled: boolean;
}

export const enum SyncSource {
	Settings = 1,
	Keybindings,
	Extensions
}

export const enum SyncStatus {
	Uninitialized = 'uninitialized',
	Idle = 'idle',
	Syncing = 'syncing',
	HasConflicts = 'hasConflicts',
}

export interface ISynchroniser {

	readonly status: SyncStatus;
	readonly onDidChangeStatus: Event<SyncStatus>;
	readonly onDidChangeLocal: Event<void>;

	sync(_continue?: boolean): Promise<boolean>;
	stop(): void;
}

export const IUserDataSyncService = createDecorator<IUserDataSyncService>('IUserDataSyncService');

export interface IUserDataSyncService extends ISynchroniser {
	_serviceBrand: any;
	readonly conflictsSource: SyncSource | null;

	removeExtension(identifier: IExtensionIdentifier): Promise<void>;
}

export const ISettingsMergeService = createDecorator<ISettingsMergeService>('ISettingsMergeService');

export interface ISettingsMergeService {

	_serviceBrand: undefined;

	merge(localContent: string, remoteContent: string, baseContent: string | null, ignoredSettings: string[]): Promise<{ mergeContent: string, hasChanges: boolean, hasConflicts: boolean }>;

	computeRemoteContent(localContent: string, remoteContent: string, ignoredSettings: string[]): Promise<string>;

}

export const IUserDataSyncUtilService = createDecorator<IUserDataSyncUtilService>('IUserDataSyncUtilService');

export interface IUserDataSyncUtilService {

	_serviceBrand: undefined;

	resolveUserBindings(userbindings: string[]): Promise<IStringDictionary<string>>;

	resolveFormattingOptions(resource: URI): Promise<FormattingOptions>;

}

export const IUserDataSyncLogService = createDecorator<IUserDataSyncLogService>('IUserDataSyncLogService');

export interface IUserDataSyncLogService extends ILogService {

}

export const CONTEXT_SYNC_STATE = new RawContextKey<string>('syncStatus', SyncStatus.Uninitialized);
