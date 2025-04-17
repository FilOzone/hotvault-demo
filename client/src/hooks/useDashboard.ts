import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";

export const useDashboard = () => {
  const { account } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRails, setIsLoadingRails] = useState(false);

  return {
    isLoading,
    isLoadingRails,
  };
};
