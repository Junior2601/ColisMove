import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Charge des données au montage, puis à chaque changement de `deps`.
 *   const { data, loading, error, reload, setData } = useApi(() => adminApi.getStats(), []);
 * Les anciennes données restent affichées pendant un rechargement (pas de clignotement).
 */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true; // ignore la réponse si le composant a changé entre-temps
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((data) => active && setState({ data, loading: false, error: null }))
      .catch((error) => active && setState((s) => ({ ...s, loading: false, error })));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const setData = useCallback(
    (updater) =>
      setState((s) => ({ ...s, data: typeof updater === "function" ? updater(s.data) : updater })),
    []
  );

  return { ...state, reload, setData };
}

/**
 * Liste paginée avec bouton "Voir plus".
 * fetchPage({ limit, offset }) doit renvoyer { items, total, ...autresChamps }.
 * Repart de la première page dès que `deps` (les filtres) change.
 *
 *   const trips = usePaginated((page) => adminApi.listTrips({ q, ...page }), [q]);
 *   trips.items, trips.hasMore, trips.loadMore(), trips.setItems(...)
 */
export function usePaginated(fetchPage, deps = [], pageSize = 20) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState(null); // champs renvoyés en plus (ex. counts des voyageurs)
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0); // seule la dernière requête lancée a le droit de mettre à jour l'état

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    fetchPage({ limit: pageSize, offset: 0 })
      .then(({ items: firstPage, total: count, ...rest }) => {
        if (id !== requestId.current) return;
        setItems(firstPage);
        setTotal(count);
        setMeta(rest);
      })
      .catch((err) => id === requestId.current && setError(err))
      .finally(() => id === requestId.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey, pageSize]);

  async function loadMore() {
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage({ limit: pageSize, offset: items.length });
      if (id !== requestId.current) return;
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  }

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    items, setItems,
    total, setTotal,
    meta, setMeta,
    loading, loadingMore, error,
    hasMore: items.length < total,
    loadMore, reload,
  };
}
