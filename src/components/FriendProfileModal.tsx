import React from "react";
import { Button, Modal, Typography } from "@douyinfe/semi-ui";
import type { DiscoveredPeer, Friend } from "../types/call";
import { useI18n } from "../i18n/index";

const { Text, Title } = Typography;

interface Props {
  peer: DiscoveredPeer | null;
  friend?: Friend;
  blocked: boolean;
  onClose: () => void;
  onRequestFriend: () => void;
  onRemoveFriend: () => void;
  onToggleBlock: () => void;
}

const FriendProfileModal: React.FC<Props> = ({
  peer,
  friend,
  blocked,
  onClose,
  onRequestFriend,
  onRemoveFriend,
  onToggleBlock,
}) => {
  const { t } = useI18n();
  const statusLabel = blocked
    ? t("friends.blocked")
    : friend
      ? t("friends.friend")
      : t("friends.peer");

  return (
    <Modal
      visible={!!peer}
      onCancel={onClose}
      title={t("friends.statusTitle")}
      footer={null}
      centered
      className="xdx-incoming-modal xdx-friend-profile-modal"
      width={420}
      maskStyle={{
        backdropFilter: "blur(12px)",
        background: "rgba(0,0,0,0.5)",
      }}
    >
      {peer && (
        <div className="xdx-friend-profile-content">
          <Title heading={4} style={{ color: "#fff", margin: 0 }}>
            {peer.displayName}
          </Title>
          <Text size="small" style={{ color: "rgba(255,255,255,0.4)" }}>
            {peer.callingCode}
          </Text>
          <div className="xdx-friend-status-row">
            <Text size="small" style={{ color: "rgba(255,255,255,0.55)" }}>
              {t("friends.status")}
            </Text>
            <span className={`xdx-friend-status-pill ${blocked ? "blocked" : friend ? "friend" : "peer"}`}>
              {statusLabel}
            </span>
          </div>
          {!blocked && !friend && (
            <Button className="xdx-btn-save" onClick={onRequestFriend}>
              {t("friends.sendRequest")}
            </Button>
          )}
          {!blocked && !!friend && (
            <Button
              theme="borderless"
              className="xdx-friend-danger-btn"
              onClick={onRemoveFriend}
            >
              {t("friends.remove")}
            </Button>
          )}
          <Button
            theme="borderless"
            className="xdx-friend-danger-btn"
            onClick={onToggleBlock}
          >
            {blocked ? t("friends.unblock") : t("friends.block")}
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default FriendProfileModal;
