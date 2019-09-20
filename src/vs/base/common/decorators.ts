/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function createDecorator(mapFn: (fn: Function, key: string) => Function): Function {
	return (target: any, key: string, descriptor: any) => {
		let fnKey: string | null = null;
		let fn: Function | null = null;

		if (typeof descriptor.value === 'function') {
			fnKey = 'value';
			fn = descriptor.value;
		} else if (typeof descriptor.get === 'function') {
			fnKey = 'get';
			fn = descriptor.get;
		}

		if (!fn) {
			throw new Error('not supported');
		}

		descriptor[fnKey!] = mapFn(fn, key);
	};
}

let memoizeId = 0;
export function createMemoizer() {
	const memoizeKeyPrefix = `$memoize${memoizeId++}`;
	let self: any = undefined;

	const result = function memoize(target: any, key: string, descriptor: any) {
		let fnKey: string | null = null;
		let fn: Function | null = null;

		if (typeof descriptor.value === 'function') {
			fnKey = 'value';
			fn = descriptor.value;

			if (fn!.length !== 0) {
				console.warn('Memoize should only be used in functions with zero parameters');
			}
		} else if (typeof descriptor.get === 'function') {
			fnKey = 'get';
			fn = descriptor.get;
		}

		if (!fn) {
			throw new Error('not supported');
		}

		const memoizeKey = `${memoizeKeyPrefix}:${key}`;
		descriptor[fnKey!] = function (...args: any[]) {
			self = this;

			if (!this.hasOwnProperty(memoizeKey)) {
				Object.defineProperty(this, memoizeKey, {
					configurable: true,
					enumerable: false,
					writable: true,
					value: fn!.apply(this, args)
				});
			}

			return this[memoizeKey];
		};
	};

	result.clear = () => {
		if (typeof self === 'undefined') {
			return;
		}
		Object.getOwnPropertyNames(self).forEach(property => {
			if (property.indexOf(memoizeKeyPrefix) === 0) {
				delete self[property];
			}
		});
	};

	return result;
}

export function memoize(target: any, key: string, descriptor: any) {
	return createMemoizer()(target, key, descriptor);
}

export interface IDebouceReducer<T> {
	(previousValue: T, ...args: any[]): T;
}

export function debounce<T>(delay: number, reducer?: IDebouceReducer<T>, initialValueProvider?: () => T): Function {
	return createDecorator((fn, key) => {
		const timerKey = `$debounce$${key}`;
		const resultKey = `$debounce$result$${key}`;

		return function (this: any, ...args: any[]) {
			if (!this[resultKey]) {
				this[resultKey] = initialValueProvider ? initialValueProvider() : undefined;
			}

			clearTimeout(this[timerKey]);

			if (reducer) {
				this[resultKey] = reducer(this[resultKey], ...args);
				args = [this[resultKey]];
			}

			this[timerKey] = setTimeout(() => {
				fn.apply(this, args);
				this[resultKey] = initialValueProvider ? initialValueProvider() : undefined;
			}, delay);
		};
	});
}
