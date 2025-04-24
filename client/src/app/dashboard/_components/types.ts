export interface Piece {
  id: number;
  cid: string;
  filename: string;
  size: number;
  serviceName: string;
  serviceUrl: string;
  createdAt: string;
  updatedAt: string;
  pendingRemoval?: boolean;
  removalDate?: string;
  proofSetDbId?: number;
  serviceProofSetId?: string;
  rootId?: string;
}

export interface FilesTabProps {
  isLoading: boolean;
}

export interface DownloadError extends Error {
  options?: string[];
}

export interface ProofDetails {
  pieceId: number;
  pieceFilename: string;
  serviceProofSetId: string;
  cid: string;
  rootId?: string;
}

export interface UploadProgress {
  status: string;
  progress?: number;
  message?: string;
  cid?: string;
  error?: string;
  lastUpdated?: number;
  isStalled?: boolean;
  filename?: string;
  jobId?: string;
  serviceProofSetId?: string;
}
