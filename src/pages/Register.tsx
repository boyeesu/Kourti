import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to onboarding page for sign up
    navigate("/onboarding", { replace: true });
  }, [navigate]);

  return null;
}
