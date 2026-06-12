import { useEffect, useMemo, useRef, useState } from 'react';

export function useDebounce<T = string>(value: T, delay = 700,):T {
	const memoizedValue = useMemo(() => {
		return JSON.stringify(value,)
	}, [value,],)
	const parsedValue = useMemo(() => {
		return JSON.parse(memoizedValue,)
	}, [memoizedValue,],)

	const [debouncedValue, setDebouncedValue,] = useState<T>(parsedValue,)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null,)

	useEffect(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current,)
		}
		timerRef.current = setTimeout(() => {
			setDebouncedValue(value,)
		}, delay,)

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current,)
			}
		}
	}, [value, delay,],)

	return debouncedValue
}