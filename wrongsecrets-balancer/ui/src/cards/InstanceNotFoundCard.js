import React from 'react';
import styled from 'styled-components';
import { FormattedMessage } from 'react-intl';

import { CenteredCard } from '../Components';

import warning from './warning.svg';

const WarningIcon = styled.img.attrs({ src: warning })`
  height: 48px;
  width: auto;
  margin-right: 12px;
`;

export const InstanceNotFoundCard = () => {
  return (
    <CenteredCard>
      <WarningIcon />
      <span data-test-id="instance-not-found">
        <FormattedMessage
          id="instance_status_not_found"
          defaultMessage="Could not find the instance for the team. You can recreate it by logging back in."
        />
      </span>
    </CenteredCard>
  );
};
