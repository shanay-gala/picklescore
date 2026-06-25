// Match view → redirect to its fixture page (public viewers can browse from there)
import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { Loader } from "@/src/ui";

export default function MatchRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useEffect(() => {
    if (!id) return;
    api.getMatch(id)
      .then((m) => router.replace(`/fixture/${m.fixture_id}`))
      .catch(() => router.replace("/"));
  }, [id]);
  return <Loader />;
}
