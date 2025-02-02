/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';
import { updateContributedOpeners } from 'vs/workbench/contrib/externalUriOpener/common/configuration';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

interface RegisteredExternalOpener {
	readonly extensionId: string;

	isCurrentlyRegistered: boolean;
}

interface OpenersMemento {
	[id: string]: RegisteredExternalOpener;
}

export class ContributedExternalUriOpenersStore extends Disposable {

	private static readonly STORAGE_ID = 'externalUriOpeners';

	private readonly _openers = new Map<string, RegisteredExternalOpener>();
	private readonly _memento: Memento;
	private _mementoObject: OpenersMemento;

	constructor(
		@IStorageService storageService: IStorageService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
		super();

		this._memento = new Memento(ContributedExternalUriOpenersStore.STORAGE_ID, storageService);
		this._mementoObject = this._memento.getMemento(StorageScope.GLOBAL, StorageTarget.MACHINE);
		for (const [id, value] of Object.entries(this._mementoObject || {})) {
			this.add(id, value.extensionId, { isCurrentlyRegistered: false });
		}

		this.invalidateOpenersOnExtensionsChanged();

		this._register(this._extensionService.onDidChangeExtensions(() => this.invalidateOpenersOnExtensionsChanged()));
		this._register(this._extensionService.onDidChangeExtensionsStatus(() => this.invalidateOpenersOnExtensionsChanged()));
	}

	public didRegisterOpener(id: string, extensionId: string): void {
		this.add(id, extensionId, {
			isCurrentlyRegistered: true
		});
	}

	private add(id: string, extensionId: string, options: { isCurrentlyRegistered: boolean }): void {
		const existing = this._openers.get(id);
		if (existing) {
			existing.isCurrentlyRegistered = existing.isCurrentlyRegistered || options.isCurrentlyRegistered;
			return;
		}

		const entry = {
			extensionId,
			isCurrentlyRegistered: options.isCurrentlyRegistered
		};
		this._openers.set(id, entry);

		this._mementoObject[id] = entry;
		this._memento.saveMemento();

		this.updateSchema();
	}

	public delete(id: string): void {
		this._openers.delete(id);

		delete this._mementoObject[id];
		this._memento.saveMemento();

		this.updateSchema();
	}

	private async invalidateOpenersOnExtensionsChanged() {
		const registeredExtensions = await this._extensionService.getExtensions();

		for (const [id, entry] of this._openers) {
			const extension = registeredExtensions.find(r => r.identifier.value === entry.extensionId);
			if (extension) {
				if (!this._extensionService.canRemoveExtension(extension)) {
					// The extension is running. We should have registered openers at this point
					if (!entry.isCurrentlyRegistered) {
						this.delete(id);
					}
				}
			} else {
				// The opener came from an extension that is no longer enabled/installed
				this.delete(id);
			}
		}
	}

	private updateSchema() {
		const ids: string[] = [];
		const descriptions: string[] = [];

		for (const [id, entry] of this._openers) {
			ids.push(id);
			descriptions.push(entry.extensionId);
		}

		updateContributedOpeners(ids, descriptions);
	}
}
