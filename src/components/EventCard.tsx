import React from "react";
import { Typography } from "@douyinfe/semi-ui";

const { Text } = Typography;

interface Props {
  image: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}

const EventCard: React.FC<Props> = ({ image, title, description, children }) => (
  <div className="xdx-event-card">
    <div className="xdx-event-card-img">
      <img src={image} alt="" draggable={false} />
    </div>
    <div className="xdx-event-card-body">
      <Text strong style={{ color: "#fff", fontSize: 14 }}>
        {title}
      </Text>
      {description && (
        <Text size="small" style={{ color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          {description}
        </Text>
      )}
      {children}
    </div>
  </div>
);

export default EventCard;
