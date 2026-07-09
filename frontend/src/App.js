import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";

import GamesPage from "@/pages/GamesPage";
import TeamsPage from "@/pages/TeamsPage";
import StandingsPage from "@/pages/StandingsPage";
import FixtureDetail from "@/pages/FixtureDetail";
import RefLogin from "@/pages/RefLogin";
import RefereeDashboard from "@/pages/RefereeDashboard";
import RefereeFixture from "@/pages/RefereeFixture";
import RefereeMatch from "@/pages/RefereeMatch";
import RefereeAdmin from "@/pages/RefereeAdmin";
import TeamDetail from "@/pages/TeamDetail";

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        theme="system"
        toastOptions={{
          classNames: {
            toast: "border border-border bg-card text-foreground",
          },
        }}
      />
      <Routes>
        <Route path="/" element={<GamesPage />} />
        <Route path="/teams" element={<TeamsPage />} />
        <Route path="/team/:id" element={<TeamDetail />} />
        <Route path="/standings" element={<StandingsPage />} />
        <Route path="/fixture/:id" element={<FixtureDetail />} />
        <Route path="/ref" element={<RefLogin />} />
        <Route path="/referee" element={<RefereeDashboard />} />
        <Route path="/referee/admin" element={<RefereeAdmin />} />
        <Route path="/referee/fixture/:id" element={<RefereeFixture />} />
        <Route path="/referee/match/:id" element={<RefereeMatch />} />
        <Route path="*" element={<GamesPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
