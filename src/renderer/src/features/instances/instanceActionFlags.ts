import { Loader } from "@/types/Loader";
import { loaderRequiresBackend } from "@renderer/utilities/connectivity";
import { VersionDiffence } from "@renderer/features/instances/atoms";

export interface InstanceActionFlagsInput {
  hasVersion: boolean;
  shareCode?: string;
  downloadedVersion?: boolean;
  owner?: string;
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
    loaderName,
    hasAccount,
    isOwnerVersion,
    versionDiffence,
    hasPublishDiff,
    isInternetOnline,
    isNetwork,
  } = input;

  const showShareAction = hasVersion && !shareCode;
  const showShareManagementAction =
    hasVersion && !!shareCode && !downloadedVersion;
  const showPublishActions =
    hasPublishDiff && !downloadedVersion && !!shareCode;
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
  const canRenameVersion =
    hasVersion && (!owner || !hasAccount || isOwnerVersion || !!downloadedVersion);
  const canEditLogo =
    hasVersion && !downloadedVersion && (!owner || !hasAccount || isOwnerVersion);

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
