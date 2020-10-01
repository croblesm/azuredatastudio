/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'dataworkspace' {
	import * as vscode from 'vscode';
	export const enum extension {
		name = 'Microsoft.data-workspace'
	}

	/**
	 * dataworkspace extension
	 */
	export interface IExtension {
		/**
		 * register a project provider
		 * @param provider new project provider
		 * @requires a disposable object, upon disposal, the provider will be unregistered.
		 */
		registerProjectProvider(provider: IProjectProvider): vscode.Disposable;
	}

	/**
	 * Defines the capabilities of project provider
	 */
	export interface IProjectProvider {
		/**
		 * Gets the tree data provider for the given project file
		 * @param projectFile The Uri of the project file
		 */
		getProjectTreeDataProvider(projectFile: vscode.Uri): Promise<vscode.TreeDataProvider<any>>;

		/**
		 * Notify the project provider extension that the specified project file has been removed from the data workspace
		 * @param projectFile The Uri of the project file
		 */
		RemoveProject(projectFile: vscode.Uri): Promise<void>;

		/**
		 * Notify the project provider extension that the specified project file has been created from the data workspace
		 * @param projectName The name of the project file to be created
		 * @param projectFile The Uri of the project file
		 */
		CreateProject(projectName: string, projectFile: vscode.Uri): Promise<void>;

		/**
		 * Gets the supported project types
		 */
		readonly supportedProjectTypes: IProjectType[];
	}

	/**
	 * Defines the project type
	 */
	export interface IProjectType {
		/**
		 * display name of the project type
		 */
		readonly displayName: string;

		/**
		 * project file extension, e.g. sqlproj
		 */
		readonly projectFileExtension: string;

		/**
		 * Gets the icon path of the project type
		 */
		readonly icon: string | vscode.Uri | { light: string | vscode.Uri, dark: string | vscode.Uri }
	}
}
