/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface IconPath {
	dark: string;
	light: string;
}

export class IconPathHelper {
	private static extensionContext: vscode.ExtensionContext;
	public static folder_blue: IconPath;

	public static setExtensionContext(extensionContext: vscode.ExtensionContext) {
		IconPathHelper.extensionContext = extensionContext;

		IconPathHelper.folder_blue = IconPathHelper.makeIcon('folder_blue', true);
	}

	private static makeIcon(name: string, sameIcon: boolean = false) {
		const folder = 'images';

		if (sameIcon) {
			return {
				dark: IconPathHelper.extensionContext.asAbsolutePath(`${folder}/${name}.svg`),
				light: IconPathHelper.extensionContext.asAbsolutePath(`${folder}/${name}.svg`)
			};
		} else {
			return {
				dark: IconPathHelper.extensionContext.asAbsolutePath(`${folder}/dark/${name}.svg`),
				light: IconPathHelper.extensionContext.asAbsolutePath(`${folder}/light/${name}.svg`)
			};
		}
	}
}
