import { Loader } from "@/types/Loader";
import { loaderRequiresBackend } from "@renderer/utilities/connectivity";
import { VersionDiffence } from "@renderer/components/Versions";

export interface EditVersionFlagsInput {
  hasVersion: boolean;
  shareCode?: string;
  downloadedVersion?: boolean;
  owner?: string;
  loaderName?: Loader;
  hasAccount: boolean;
  isOwnerVersion: boolean;
  versionDiffence: VersionDiffence;
  isInternetOnline: boolean;
  isNetwork: boolean;
}

export function getEditVersionFlags(input: EditVersionFlagsInput) {
  const {
    hasVersion,
    shareCode,
    downloadedVersion,
    owner,
    loaderName,
    hasAccount,
    isOwnerVersion,
    versionDiffence,
    isInternetOnline,
    isNetwork,
  } = input;

  const showShareAction = hasVersion && !shareCode;
  const showShareManagementAction =
    hasVersion && !!shareCode && !downloadedVersion;
  const showPublishActions =
    versionDiffence === "new" && !downloadedVersion && !!shareCode;
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
