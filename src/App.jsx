import AuthWrapper from "./AuthWrapper";
import Planner from "./Planner";

export default function App() {
  return (
    <AuthWrapper>
      {(user) => <Planner user={user} />}
    </AuthWrapper>
  );
}