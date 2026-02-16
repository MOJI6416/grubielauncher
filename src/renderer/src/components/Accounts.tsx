import { useCallback, useEffect, useRef, useState } from "react";

const api = window.api;

import { FaDiscord, FaMicrosoft } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { CircleAlert, User, UserMinus, UserPlus, X } from "lucide-react";
import { TbSquareLetterE } from "react-icons/tb";
import { Presence } from "discord-rpc";
import AccountInfo from "./Account/AccountInfo";
import { IUser } from "@/types/IUser";
import { useAtom } from "jotai";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  consolesAtom,
  isRunningAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
} from "@renderer/stores/atoms";
import {
  addToast,
  Alert,
  Avatar,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";
import { IAuth, ILocalAccount } from "@/types/Account";
import { jwtDecode } from "jwt-decode";
import {
  DISCORD_CLIENT_ID,
  ELYBY_CLIENT_ID,
  MICROSOFT_CLIENT_ID,
} from "@/shared/config";
import { IAuthResponse } from "@/types/Auth";
import { Confirmation } from "./Modals/Confirmation";

export function Accounts() {
  const [modalSelectIsOpen, setIsOpenModalSelect] = useState(false);
  const [modalAddIsOpen, setIsOpenModalAdd] = useState(false);
  const [paths] = useAtom(pathsAtom);
  const [nickname, setNickname] = useState("");
  const [isPlain, setIsPlain] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signType, setSignType] = useState<"microsoft" | "elyby" | "discord">();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<"avatar" | "skin" | "user">();
  const [accountInfo, setAccountInfo] = useState(false);
  const [user, setUser] = useState<IUser | undefined>();
  const [selectedAccount, setSelectedAccount] = useAtom(accountAtom);
  const [accounts, setAccounts] = useAtom(accountsAtom);
  const { t } = useTranslation();
  const [isNetwork] = useAtom(networkAtom);
  const [isRunning] = useAtom(isRunningAtom);
  const [authData, setAuthData] = useAtom(authDataAtom);
  const [consoles] = useAtom(consolesAtom);
  const [, setVersion] = useAtom(selectedVersionAtom);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);

  const accountsSafe = accounts ?? [];

  const authSessionRef = useRef(0);
  const accountsRef = useRef(accountsSafe);
  useEffect(() => {
    accountsRef.current = accountsSafe;
  }, [accountsSafe]);

  const getAccountKey = useCallback(
    (a: ILocalAccount) => `${a.type}_${a.nickname}`,
    [],
  );

  const writeAccountsConf = useCallback(
    async (nextAccounts: ILocalAccount[], lastPlayed: string | null) => {
      if (!paths.launcher) return;
      const accountsConfPath = await api.path.join(
        paths.launcher,
        "accounts.json",
      );
      await api.fs.writeJSON(accountsConfPath, {
        accounts: nextAccounts,
        lastPlayed,
      });
    },
    [paths.launcher],
  );

  const closeModalSelect = useCallback(() => {
    setIsOpenModalSelect(false);
  }, []);

  const openModalSelect = useCallback(() => {
    setIsOpenModalSelect(true);
  }, []);

  const closeModalAdd = useCallback(() => {
    setNickname("");
    setIsOpenModalAdd(false);
  }, []);

  const openModalAdd = useCallback(() => {
    authSessionRef.current++;
    setIsSigning(false);
    setSignType(undefined);
    setIsPlain(false);
    setIsOpenModalAdd(true);
  }, []);

  const oauth = useCallback(
    async (
      provider: "microsoft" | "elyby" | "discord",
      code: string,
      sessionId: number,
    ) => {
      try {
        if (!paths.launcher) return;

        let authUser: IAuthResponse | null = null;
        if (provider === "microsoft") authUser = await api.auth.microsoft(code);
        else if (provider === "elyby") authUser = await api.auth.elyby(code);
        else authUser = await api.auth.discord(code);

        if (authSessionRef.current !== sessionId) return;

        if (!authUser) throw new Error();

        const current = accountsRef.current;
        const exists = current.some(
          (a) => a.nickname === authUser!.nickname && a.type === provider,
        );
        if (exists) {
          setIsSigning(false);
          setSignType(undefined);
          addToast({ color: "warning", title: t("accounts.exists") });
          return;
        }

        const account: ILocalAccount = {
          ...authUser,
          type: provider,
          image: authUser.image || "",
          friends: [],
        };

        const nextAccounts = [...current, account];

        setAccounts(nextAccounts);
        await writeAccountsConf(nextAccounts, getAccountKey(account));

        setSelectedAccount(account);
        closeModalSelect();
        closeModalAdd();

        setIsSigning(false);
        setSignType(undefined);

        addToast({ color: "success", title: t("accounts.added") });
      } catch (err) {
        if (authSessionRef.current !== sessionId) return;
        setIsSigning(false);
        setSignType(undefined);
        addToast({ color: "danger", title: t("accounts.failedLogIn") });
      }
    },
    [
      paths.launcher,
      setAccounts,
      setSelectedAccount,
      t,
      closeModalSelect,
      closeModalAdd,
      writeAccountsConf,
      getAccountKey,
    ],
  );

  useEffect(() => {
    if (!selectedAccount || !selectedAccount?.accessToken) {
      setAuthData(null);
      return;
    }

    try {
      const decode = jwtDecode<IAuth>(selectedAccount.accessToken);
      setAuthData(decode);
    } catch {
      setAuthData(null);
    }
  }, [selectedAccount, setAuthData]);

  const addPlainAccount = useCallback(async () => {
    if (!paths.launcher) return;
    const nick = nickname.trim();
    if (!nick) return;

    const current = accountsRef.current;
    const exists = current.some(
      (a) => a.nickname === nick && a.type === "plain",
    );
    if (exists) {
      addToast({ color: "warning", title: t("accounts.exists") });
      return;
    }

    const account: ILocalAccount = {
      nickname: nick,
      type: "plain",
      image: "",
      friends: [],
    };

    const nextAccounts = [...current, account];

    setAccounts(nextAccounts);
    await writeAccountsConf(nextAccounts, getAccountKey(account));

    setSelectedAccount(account);
    closeModalSelect();
    closeModalAdd();
    addToast({ color: "success", title: t("accounts.added") });
  }, [
    nickname,
    paths.launcher,
    setAccounts,
    setSelectedAccount,
    t,
    closeModalSelect,
    closeModalAdd,
    writeAccountsConf,
    getAccountKey,
  ]);

  const selectAccount = useCallback(
    async (value: string) => {
      const current = accountsRef.current;
      const account = current.find((a) => getAccountKey(a) === value);
      if (!account) return;

      if (selectedAccount) {
        try {
          await api.skins.clearManager(
            authData?.uuid || selectedAccount.nickname,
            selectedAccount.type,
          );
        } catch {}
      }

      setSelectedAccount(account);
      setVersion(undefined);

      try {
        const activity: Presence = {
          smallImageKey: "steve",
          smallImageText: account.nickname,
        };
        await api.rpc.updateActivity(activity);
      } catch {}

      await writeAccountsConf(current, getAccountKey(account));
    },
    [
      selectedAccount,
      setSelectedAccount,
      authData,
      setVersion,
      writeAccountsConf,
      getAccountKey,
    ],
  );

  const deleteAccount = useCallback(async () => {
    if (!paths.launcher) return;
    if (!selectedAccount) return;

    const current = accountsRef.current;
    const keyToRemove = getAccountKey(selectedAccount);

    const nextAccounts = current.filter(
      (a) => getAccountKey(a) !== keyToRemove,
    );

    try {
      await api.skins.clearManager(
        authData?.uuid || selectedAccount.nickname,
        selectedAccount.type,
      );
    } catch {}

    const nextSelected = nextAccounts[0];

    setAccounts(nextAccounts);
    setSelectedAccount(nextSelected);

    await writeAccountsConf(
      nextAccounts,
      nextSelected ? getAccountKey(nextSelected) : null,
    );

    addToast({ color: "success", title: t("accounts.deleted") });
  }, [
    paths.launcher,
    selectedAccount,
    setAccounts,
    setSelectedAccount,
    t,
    authData,
    writeAccountsConf,
    getAccountKey,
  ]);

  async function Auth(type: "microsoft" | "elyby" | "discord") {
    setIsPlain(false);

    let authUrl = "";
    if (type === "microsoft")
      authUrl = `https://login.live.com/oauth20_authorize.srf?client_id=${MICROSOFT_CLIENT_ID}&response_type=code&redirect_uri=http://localhost:53213/callback&scope=XboxLive.signin%20offline_access&state=microsoft`;
    else if (type === "elyby")
      authUrl = `https://account.ely.by/oauth2/v1?client_id=${ELYBY_CLIENT_ID}&redirect_uri=http://localhost:53213/callback&response_type=code&scope=offline_access,account_info,minecraft_server_session&state=elyby`;
    else
      authUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A53213%2Fcallback&scope=identify+guilds.join&state=discord`;

    const sessionId = ++authSessionRef.current;

    await api.shell.openExternal(authUrl);
    setSignType(type);
    setIsSigning(true);

    const { provider, code } = await api.auth.startServer();

    if (authSessionRef.current !== sessionId) return;
    await oauth(provider, code, sessionId);
  }

  const selectedKey = selectedAccount
    ? `${selectedAccount.type}_${selectedAccount.nickname}`
    : "";

  return (
    <>
      <div className="flex space-x-4 items-center min-w-0">
        {selectedAccount ? (
          <>
            <div
              className={`flex items-center space-x-2 min-w-0 ${
                selectedAccount.type != "plain" && isNetwork
                  ? "cursor-pointer"
                  : ""
              }`}
              onClick={async () => {
                if (
                  isLoading ||
                  selectedAccount.type == "plain" ||
                  !isNetwork ||
                  !authData ||
                  !selectedAccount.accessToken
                )
                  return;

                setIsLoading(true);
                setLoadingType("user");

                try {
                  const user = await api.backend.getUser(
                    selectedAccount.accessToken,
                    authData.sub,
                  );
                  if (user) {
                    setUser(user);
                    setAccountInfo(true);
                    return;
                  }
                  throw new Error();
                } catch (err) {
                  addToast({ color: "danger", title: t("accountInfo.error") });
                } finally {
                  setIsLoading(false);
                  setLoadingType(undefined);
                }
              }}
            >
              <Avatar
                className="flex-shrink-0"
                src={selectedAccount.image}
                name={selectedAccount.nickname}
              />
              <p className="text-xl font-semibold truncate flex-grow">
                {selectedAccount.nickname}
              </p>
              {isLoading && loadingType == "user" && <Spinner size="sm" />}
            </div>

            <Button
              variant="flat"
              isDisabled={isRunning}
              startContent={<User className="flex-shrink-0" size={22} />}
              onPress={openModalSelect}
            >
              {t("accounts.accounts")}
            </Button>
          </>
        ) : (
          <>
            <Alert color="warning" title={t("accounts.notSelected")} />
            <div>
              <Button
                variant="flat"
                className="animate-pulse"
                startContent={<User size={22} />}
                onPress={
                  accountsSafe.length != 0 ? openModalSelect : openModalAdd
                }
              >
                {t("accounts.select")}
              </Button>
            </div>
          </>
        )}
      </div>

      <Modal isOpen={modalSelectIsOpen} onClose={closeModalSelect} size="sm">
        <ModalContent>
          <ModalHeader>{t("accounts.accountSelection")}</ModalHeader>

          <ModalBody>
            <div className="flex flex-col space-y-4">
              <Select
                placeholder={t("accounts.selectAccount")}
                isDisabled={accountsSafe.length == 0}
                selectedKeys={selectedKey ? new Set([selectedKey]) : new Set()}
                renderValue={(opts) => {
                  return opts.map((option) => {
                    const account = accountsSafe.find(
                      (a) => `${a.type}_${a.nickname}` == option.key,
                    );
                    if (!account)
                      return <p key={String(option.key)}>Undefined user</p>;

                    return (
                      <div
                        className="flex space-x-1 items-center"
                        key={String(option.key)}
                      >
                        {" "}
                        {/* Изменено: key */}
                        <Avatar
                          src={account.image}
                          size="sm"
                          name={account.nickname}
                        />
                        <p>{account.nickname}</p>
                        {account.type == "microsoft" ? (
                          <FaMicrosoft size={22} />
                        ) : account.type == "elyby" ? (
                          <TbSquareLetterE size={22} />
                        ) : account.type == "discord" ? (
                          <FaDiscord size={22} />
                        ) : (
                          <User size={22} />
                        )}
                      </div>
                    );
                  });
                }}
                onChange={async (event) => {
                  const value = event.target.value;
                  if (!value) return;
                  await selectAccount(value);
                }}
              >
                {accountsSafe.map((account) => (
                  <SelectItem key={`${account.type}_${account.nickname}`}>
                    <div className="flex space-x-1 items-center">
                      <Avatar
                        src={account.image}
                        size="sm"
                        name={account.nickname}
                      />
                      <p>{account.nickname}</p>
                      {account.type == "microsoft" ? (
                        <FaMicrosoft size={22} />
                      ) : account.type == "elyby" ? (
                        <TbSquareLetterE size={22} />
                      ) : account.type == "discord" ? (
                        <FaDiscord size={22} />
                      ) : (
                        <User size={22} />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </Select>

              <div className="flex gap-2">
                {selectedAccount ? (
                  <Button
                    color="danger"
                    variant="flat"
                    isDisabled={consoles.consoles.some(
                      (c) => c.status == "running",
                    )}
                    startContent={<UserMinus size={22} />}
                    onPress={() => setIsConfirmationOpen(true)}
                  >
                    {t("accounts.delete")}
                  </Button>
                ) : null}

                <Button
                  variant="flat"
                  startContent={<UserPlus size={22} />}
                  onPress={openModalAdd}
                >
                  {t("common.add")}
                </Button>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal
        size="md"
        isOpen={modalAddIsOpen}
        onClose={() => {
          if (!isSigning) closeModalAdd();
        }}
      >
        <ModalContent>
          <ModalHeader>{t("accounts.addingAccount")}</ModalHeader>
          <ModalBody>
            <div className="flex flex-col space-y-4">
              <div className="flex flex-col space-y-1">
                <p>{t("accounts.type")}:</p>

                <div className="flex flex-col space-y-2">
                  <div className="flex space-x-2 items-center">
                    <Button
                      variant="flat"
                      startContent={<User size={22} />}
                      isDisabled={isPlain || isSigning}
                      onPress={() => setIsPlain(true)}
                    >
                      {t("accounts.plainAccount")}
                    </Button>

                    <Button
                      variant="flat"
                      color={
                        isSigning && signType == "discord"
                          ? "danger"
                          : undefined
                      }
                      isDisabled={
                        (isSigning && signType != "discord") || !isNetwork
                      }
                      startContent={
                        isSigning && signType == "discord" ? (
                          <X size={22} />
                        ) : (
                          <FaDiscord size={22} />
                        )
                      }
                      onPress={async () => {
                        if (isSigning) {
                          authSessionRef.current++;
                          setIsSigning(false);
                          setSignType(undefined);
                          addToast({
                            color: "success",
                            title: t("accounts.cancelled"),
                          });
                          return;
                        }
                        await Auth("discord");
                      }}
                    >
                      {isSigning && signType == "discord"
                        ? t("common.cancel")
                        : "Discord"}
                    </Button>
                  </div>

                  <div className="flex space-x-2 items-center">
                    <Button
                      variant="flat"
                      color={
                        isSigning && signType == "microsoft"
                          ? "danger"
                          : undefined
                      }
                      startContent={
                        isSigning && signType == "microsoft" ? (
                          <X size={22} />
                        ) : (
                          <FaMicrosoft size={22} />
                        )
                      }
                      isDisabled={
                        (isSigning && signType != "microsoft") || !isNetwork
                      }
                      onPress={async () => {
                        if (isSigning) {
                          authSessionRef.current++;
                          setIsSigning(false);
                          setSignType(undefined);
                          addToast({
                            color: "success",
                            title: t("accounts.cancelled"),
                          });
                          return;
                        }
                        await Auth("microsoft");
                      }}
                    >
                      {isSigning && signType == "microsoft"
                        ? t("common.cancel")
                        : t("accounts.microsoft")}
                    </Button>

                    <Button
                      variant="flat"
                      color={
                        isSigning && signType == "elyby" ? "danger" : undefined
                      }
                      startContent={
                        isSigning && signType == "elyby" ? (
                          <X size={22} />
                        ) : (
                          <TbSquareLetterE size={22} />
                        )
                      }
                      isDisabled={
                        (isSigning && signType != "elyby") || !isNetwork
                      }
                      onPress={async () => {
                        if (isSigning) {
                          authSessionRef.current++;
                          setIsSigning(false);
                          setSignType(undefined);
                          addToast({
                            color: "success",
                            title: t("accounts.cancelled"),
                          });
                          return;
                        }
                        await Auth("elyby");
                      }}
                    >
                      {isSigning && signType == "elyby"
                        ? t("common.cancel")
                        : t("accounts.elyby")}
                    </Button>
                  </div>
                </div>
              </div>

              {isPlain ? (
                <div className="flex items-center gap-2 ">
                  <Input
                    label={t("accounts.nickname")}
                    placeholder={"Notch"}
                    className="w-full"
                    value={nickname}
                    onChange={(event) => setNickname(event.currentTarget.value)}
                    startContent={
                      nickname == "" ||
                      !!accountsSafe.find(
                        (a) => a.nickname == nickname && a.type == "plain",
                      ) ||
                      nickname.length < 3 ||
                      nickname.length > 16 ? (
                        <CircleAlert color="orange" size={22} />
                      ) : undefined
                    }
                  />

                  <Button
                    variant="flat"
                    isIconOnly
                    isDisabled={
                      nickname.trim() === "" ||
                      !!accountsSafe.find(
                        (a) =>
                          a.nickname == nickname.trim() && a.type == "plain",
                      ) ||
                      nickname.trim().length < 3 ||
                      nickname.trim().length > 16
                    }
                    onPress={async () => await addPlainAccount()}
                  >
                    <UserPlus size={22} />
                  </Button>
                </div>
              ) : null}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      {accountInfo && selectedAccount && user && (
        <AccountInfo
          onClose={() => {
            setAccountInfo(false);
          }}
          user={user}
          isOwner={true}
        />
      )}

      {isConfirmationOpen && selectedAccount && (
        <Confirmation
          content={[
            {
              text: t("accounts.confirmation", {
                nickname: selectedAccount.nickname,
              }),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("common.yes"),
              color: "danger",
              onClick: async () => {
                await deleteAccount();
                setIsConfirmationOpen(false);
              },
            },
            {
              text: t("common.no"),
              color: "default",
              onClick: () => setIsConfirmationOpen(false),
            },
          ]}
          onClose={() => setIsConfirmationOpen(false)}
        />
      )}
    </>
  );
}
