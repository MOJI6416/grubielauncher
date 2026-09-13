import { Loader } from "@/types/Loader";
import { loaderRequiresBackend } from "@renderer/utilities/connectivity";
import { VersionDiffence } from "@renderer/features/instances/atoms";

export interface InstanceActionFlagsInput {
  hasVersion: boolean;
  shareCode?: string;
  downloadedVersion?: boolean;
  owner?: string;
  ownerId?: string;
  loaderName?: Loader;
  hasAccount: boolean;
  isOwnerVersion: boolean;
  versionDiffence: VersionDiffence;
  hasPublishDiff: boolean;
  isInternetOnline: boolean;
  isNetwork: boolean;
}

export function getInstanceActionFlags(input: InstanceActionFlagsInput) {
  const {
    hasVersion,
    shareCode,
    downloadedVersion,
    owner,
    ownerId,
    loaderName,
    hasAccount,
    isOwnerVersion,
    versionDiffence,
    hasPublishDiff,
    isInternetOnline,
    isNetwork,
  } = input;

  const hasOwnerRecord = !!owner || !!ownerId;
  const mayActAsOwner = !hasOwnerRecord || !hasAccount || isOwnerVersion;

  const showShareAction = hasVersion && !shareCode;
  const showShareManagementAction =
    hasVersion && !!shareCode && !downloadedVersion && mayActAsOwner;
  const showPublishActions =
    hasPublishDiff && !downloadedVersion && !!shareCode && mayActAsOwner;
  const showSyncAction = versionDiffence === "old" && !!downloadedVersion;
  const showServerManagerAction = hasVersion;
  const showRemoteActions =
    showShareAction ||
    showShareManagementAction ||
    showPublishActions ||
    showSyncAction ||
    showServerManagerAction;
  const canFetchServerCore =
    isInternetOnline && (!loaderRequiresBackend(loaderName) || isNetwork);
  const canRenameVersion = hasVersion && (mayActAsOwner || !!downloadedVersion);
  const canEditLogo = hasVersion && !downloadedVersion && mayActAsOwner;

  return {
    showShareAction,
    showShareManagementAction,
    showPublishActions,
    showSyncAction,
    showServerManagerAction,
    showRemoteActions,
    canFetchServerCore,
    canRenameVersion,
    canEditLogo,
  };
}
