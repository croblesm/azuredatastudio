/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import * as Paths from 'vs/base/common/path';
import * as resources from 'vs/base/common/resources';
import * as Json from 'vs/base/common/json';
import { ExtensionData, IThemeExtensionPoint, IWorkbenchProductIconTheme } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { DEFAULT_PRODUCT_ICON_THEME_SETTING_VALUE } from 'vs/workbench/services/themes/common/themeConfiguration';
import { fontIdRegex, fontWeightRegex, fontStyleRegex, fontFormatRegex } from 'vs/workbench/services/themes/common/productIconThemeSchema';
import { isString } from 'vs/base/common/types';
import { ILogService } from 'vs/platform/log/common/log';
import { IconDefinition, getIconRegistry, IconContribution, IconFontDefinition, IconFontSource } from 'vs/platform/theme/common/iconRegistry';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/common/extensionResourceLoader';

export const DEFAULT_PRODUCT_ICON_THEME_ID = ''; // TODO

export class ProductIconThemeData implements IWorkbenchProductIconTheme {

	static readonly STORAGE_KEY = 'productIconThemeData';

	id: string;
	label: string;
	settingsId: string;
	description?: string;
	isLoaded: boolean;
	location?: URI;
	extensionData?: ExtensionData;
	watch?: boolean;

	iconThemeDocument: ProductIconThemeDocument = { iconDefinitions: new Map() };
	styleSheetContent?: string;

	private constructor(id: string, label: string, settingsId: string) {
		this.id = id;
		this.label = label;
		this.settingsId = settingsId;
		this.isLoaded = false;
	}

	public getIcon(iconContribution: IconContribution): IconDefinition | undefined {
		return _resolveIconDefinition(iconContribution, this.iconThemeDocument);
	}

	public ensureLoaded(fileService: IExtensionResourceLoaderService, logService: ILogService): Promise<string | undefined> {
		return !this.isLoaded ? this.load(fileService, logService) : Promise.resolve(this.styleSheetContent);
	}

	public reload(fileService: IExtensionResourceLoaderService, logService: ILogService): Promise<string | undefined> {
		return this.load(fileService, logService);
	}

	private async load(fileService: IExtensionResourceLoaderService, logService: ILogService): Promise<string | undefined> {
		const location = this.location;
		if (!location) {
			return Promise.resolve(this.styleSheetContent);
		}
		const warnings: string[] = [];
		this.iconThemeDocument = await _loadProductIconThemeDocument(fileService, location, warnings);
		this.isLoaded = true;
		if (warnings.length) {
			logService.error(nls.localize('error.parseicondefs', "Problems processing product icons definitions in {0}:\n{1}", location.toString(), warnings.join('\n')));
		}
		return this.styleSheetContent;
	}

	static fromExtensionTheme(iconTheme: IThemeExtensionPoint, iconThemeLocation: URI, extensionData: ExtensionData): ProductIconThemeData {
		const id = extensionData.extensionId + '-' + iconTheme.id;
		const label = iconTheme.label || Paths.basename(iconTheme.path);
		const settingsId = iconTheme.id;

		const themeData = new ProductIconThemeData(id, label, settingsId);

		themeData.description = iconTheme.description;
		themeData.location = iconThemeLocation;
		themeData.extensionData = extensionData;
		themeData.watch = iconTheme._watch;
		themeData.isLoaded = false;
		return themeData;
	}

	static createUnloadedTheme(id: string): ProductIconThemeData {
		const themeData = new ProductIconThemeData(id, '', '__' + id);
		themeData.isLoaded = false;
		themeData.extensionData = undefined;
		themeData.watch = false;
		return themeData;
	}

	private static _defaultProductIconTheme: ProductIconThemeData | null = null;

	static get defaultTheme(): ProductIconThemeData {
		let themeData = ProductIconThemeData._defaultProductIconTheme;
		if (!themeData) {
			themeData = ProductIconThemeData._defaultProductIconTheme = new ProductIconThemeData(DEFAULT_PRODUCT_ICON_THEME_ID, nls.localize('defaultTheme', 'Default'), DEFAULT_PRODUCT_ICON_THEME_SETTING_VALUE);
			themeData.isLoaded = true;
			themeData.extensionData = undefined;
			themeData.watch = false;
		}
		return themeData;
	}

	static fromStorageData(storageService: IStorageService): ProductIconThemeData | undefined {
		const input = storageService.get(ProductIconThemeData.STORAGE_KEY, StorageScope.GLOBAL);
		if (!input) {
			return undefined;
		}
		try {
			let data = JSON.parse(input);
			const theme = new ProductIconThemeData('', '', '');
			for (let key in data) {
				switch (key) {
					case 'id':
					case 'label':
					case 'description':
					case 'settingsId':
					case 'styleSheetContent':
					case 'watch':
						(theme as any)[key] = data[key];
						break;
					case 'location':
						// ignore, no longer restore
						break;
					case 'extensionData':
						theme.extensionData = ExtensionData.fromJSONObject(data.extensionData);
						break;
				}
			}
			return theme;
		} catch (e) {
			return undefined;
		}
	}

	toStorage(storageService: IStorageService) {
		const data = JSON.stringify({
			id: this.id,
			label: this.label,
			description: this.description,
			settingsId: this.settingsId,
			styleSheetContent: this.styleSheetContent,
			watch: this.watch,
			extensionData: ExtensionData.toJSONObject(this.extensionData),
		});
		storageService.store(ProductIconThemeData.STORAGE_KEY, data, StorageScope.GLOBAL, StorageTarget.MACHINE);
	}
}

interface ProductIconThemeDocument {
	iconDefinitions: Map<string, IconDefinition>;
}

function _loadProductIconThemeDocument(fileService: IExtensionResourceLoaderService, location: URI, warnings: string[]): Promise<ProductIconThemeDocument> {
	return fileService.readExtensionResource(location).then((content) => {
		const parseErrors: Json.ParseError[] = [];
		let contentValue = Json.parse(content, parseErrors);
		if (parseErrors.length > 0) {
			return Promise.reject(new Error(nls.localize('error.cannotparseicontheme', "Problems parsing product icons file: {0}", parseErrors.map(e => getParseErrorMessage(e.error)).join(', '))));
		} else if (Json.getNodeType(contentValue) !== 'object') {
			return Promise.reject(new Error(nls.localize('error.invalidformat', "Invalid format for product icons theme file: Object expected.")));
		} else if (!contentValue.iconDefinitions || !Array.isArray(contentValue.fonts) || !contentValue.fonts.length) {
			return Promise.reject(new Error(nls.localize('error.missingProperties', "Invalid format for product icons theme file: Must contain iconDefinitions and fonts.")));
		}

		const iconThemeDocumentLocationDirname = resources.dirname(location);

		const sanitizedFonts: Map<string, IconFontDefinition> = new Map();
		for (const font of contentValue.fonts) {
			if (isString(font.id) && font.id.match(fontIdRegex)) {
				const fontId = font.id;

				let fontWeight = undefined;
				if (isString(font.weight) && font.weight.match(fontWeightRegex)) {
					fontWeight = font.weight;
				} else {
					warnings.push(nls.localize('error.fontWeight', 'Invalid font weight in font \'{0}\'. Ignoring setting.', font.id));
				}

				let fontStyle = undefined;
				if (isString(font.style) && font.style.match(fontStyleRegex)) {
					fontStyle = font.style;
				} else {
					warnings.push(nls.localize('error.fontStyle', 'Invalid font style in font \'{0}\'. Ignoring setting.', font.id));
				}

				const sanitizedSrc: IconFontSource[] = [];
				if (Array.isArray(font.src)) {
					for (const s of font.src) {
						if (isString(s.path) && isString(s.format) && s.format.match(fontFormatRegex)) {
							const iconFontLocation = resources.joinPath(iconThemeDocumentLocationDirname, s.path);
							sanitizedSrc.push({ location: iconFontLocation, format: s.format });
						} else {
							warnings.push(nls.localize('error.fontSrc', 'Invalid font source in font \'{0}\'. Ignoring source.', font.id));
						}
					}
				}
				if (sanitizedSrc.length) {
					sanitizedFonts.set(fontId, { weight: fontWeight, style: fontStyle, src: sanitizedSrc });
				} else {
					warnings.push(nls.localize('error.noFontSrc', 'No valid font source in font \'{0}\'. Ignoring font definition.', font.id));
				}
			} else {
				warnings.push(nls.localize('error.fontId', 'Missing or invalid font id \'{0}\'. Skipping font definition.', font.id));
			}
		}


		const iconDefinitions = new Map<string, IconDefinition>();

		const primaryFontId = contentValue.fonts[0].id as string;

		for (const iconId in contentValue.iconDefinitions) {
			const definition = contentValue.iconDefinitions[iconId];
			if (isString(definition.fontCharacter)) {
				const fontId = definition.fontId ?? primaryFontId;
				const fontDefinition = sanitizedFonts.get(fontId);
				if (fontDefinition) {

					const font = { id: `pi-${fontId}`, definition: fontDefinition };
					iconDefinitions.set(iconId, { fontCharacter: definition.fontCharacter, font });
				} else {
					warnings.push(nls.localize('error.icon.font', 'Skipping icon definition \'{0}\'. Unknown font.', iconId));
				}
			} else {
				warnings.push(nls.localize('error.icon.fontCharacter', 'Skipping icon definition \'{0}\'. Unknown fontCharacter.', iconId));
			}
		}
		return { iconDefinitions };
	});
}

const iconRegistry = getIconRegistry();

function _resolveIconDefinition(iconContribution: IconContribution, iconThemeDocument: ProductIconThemeDocument): IconDefinition | undefined {
	const iconDefinitions = iconThemeDocument.iconDefinitions;
	let definition: IconDefinition | undefined = iconDefinitions.get(iconContribution.id);
	let defaults = iconContribution.defaults;
	while (!definition && ThemeIcon.isThemeIcon(defaults)) {
		// look if an inherited icon has a definition
		const ic = iconRegistry.getIcon(defaults.id);
		if (ic) {
			definition = iconDefinitions.get(ic.id);
			defaults = ic.defaults;
		} else {
			return undefined;
		}
	}
	if (definition) {
		return definition;
	}
	if (!ThemeIcon.isThemeIcon(defaults)) {
		return defaults;
	}
	return undefined;
}
