import { useState, useEffect } from "react";
import { BrowserProvider } from "ethers";
import { useAuth } from "@/contexts/AuthContext";

export const useBlockNumber = () => {
  const { account } = useAuth();
  const [currentBlockNumber, setCurrentBlockNumber] = useState<number | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!window.ethereum || !account) {
      setIsLoading(false);
      return;
    }

    const getBlockNumber = async () => {
      try {
        if (window.ethereum) {
          const provider = new BrowserProvider(window.ethereum);
          const blockNumber = await provider.getBlockNumber();
          setCurrentBlockNumber(blockNumber);
        }
      } catch (error) {
        console.error("Error getting current block number:", error);
      } finally {
        setIsLoading(false);
      }
    };

    getBlockNumber();

    const intervalId = setInterval(getBlockNumber, 15000);
    return () => {
      clearInterval(intervalId);
    };
  }, [account]);

  return { currentBlockNumber, isLoading };
};
