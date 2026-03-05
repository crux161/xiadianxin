import React from "react";
import { Avatar, Button, Modal, Typography } from "@douyinfe/semi-ui";
import { useI18n } from "../i18n/index";

const { Text, Title } = Typography;

export interface PendingFriendRequest {
  callingCode: string;
  displayName: string;
  avatarId?: string;
  publicKey?: string;
  voicemailKey?: string;
}

interface Props {
  request: PendingFriendRequest | null;
  onAccept: () => void;
  onDecline: () => void;
}

const FriendRequestDialog: React.FC<Props> = ({ request, onAccept, onDecline }) => {
  const { t } = useI18n();
  return (
    <Modal
      visible={!!request}
      closable={false}
      footer={null}
      centered
      maskClosable={false}
      className="xdx-incoming-modal"
      width={380}
      maskStyle={{
        backdropFilter: "blur(12px)",
        background: "rgba(0,0,0,0.5)",
      }}
    >
      {request && (
        <div className="xdx-friend-request-modal">
          <Avatar
            size="extra-large"
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              marginBottom: 16,
            }}
          >
            {request.displayName.charAt(0)}
          </Avatar>
          <Text className="xdx-friend-status-chip">{t("friends.request")}</Text>
          <Title heading={4} style={{ color: "#fff", margin: "10px 0 4px" }}>
            {request.displayName}
          </Title>
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
            {t("friends.requestDesc")}
          </Text>
          <Text
            size="small"
            style={{
              color: "rgba(255,255,255,0.3)",
              display: "block",
              margin: "6px 0 20px",
            }}
          >
            {request.callingCode}
          </Text>
          <div className="xdx-friend-request-actions">
            <Button theme="borderless" className="xdx-friend-decline-btn" onClick={onDecline}>
              {t("friends.deny")}
            </Button>
            <Button className="xdx-btn-save" onClick={onAccept}>
              {t("friends.approve")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default FriendRequestDialog;
