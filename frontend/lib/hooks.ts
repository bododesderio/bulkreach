/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 *
 * Thin React Query wrappers over the `api()` choke point in `lib/api.ts`.
 * `api()` already attaches the bearer/impersonation token, does a silent
 * refresh + one retry on 401, and throws `ApiError` on non-2xx — so these
 * hooks only add caching, dedup, and consistent loading/error state.
 */
'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
  type QueryKey,
} from '@tanstack/react-query';

/**
 * Query hook. Pass a stable `key` and a `fetcher` (usually `() => api(path, { auth: true })`).
 * Returns the standard React Query result (`data`, `isLoading`, `isError`, `error`, `refetch`, …).
 */
export function useApiQuery<T>(
  key: QueryKey,
  fetcher: () => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T, Error, T, QueryKey>({
    queryKey: key,
    queryFn: fetcher,
    ...options,
  });
}

/**
 * Mutation hook. Pass a `mutator` (e.g. `(vars) => api(path, { method: 'POST', body, auth: true })`).
 * `invalidate` lists query keys to refetch on success (kept simple: exact-prefix match).
 */
export function useApiMutation<TData, TVars = void>(
  mutator: (vars: TVars) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, Error, TVars>, 'mutationFn'> & {
    invalidate?: QueryKey[];
  },
) {
  const qc = useQueryClient();
  const { invalidate, onSuccess, ...rest } = options ?? {};
  return useMutation<TData, Error, TVars>({
    mutationFn: mutator,
    onSuccess: (...args) => {
      invalidate?.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      onSuccess?.(...args);
    },
    ...rest,
  });
}
