/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEmpty } from 'lodash';
import { useState } from 'react';
import cx from 'classnames';

import { Button, TextInput } from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';

import classes from './InputBox.module.scss';

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function InputBox({
  onSubmit,
  disabled = false,
  warnText,
}: {
  onSubmit: Function;
  disabled?: boolean;
  warnText?: string;
}) {
  const [inputText, setInputText] = useState('');
  return (
    <div className={classes.inputBox}>
      <TextInput
        id="input--question"
        labelText="Question"
        hideLabel
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isEmpty(inputText)) {
            onSubmit(inputText);
            setInputText('');
          }
        }}
        placeholder="Type your question here"
        value={inputText}
        onChange={(event) => {
          setInputText(event.target.value);
        }}
        disabled={disabled}
        warn={disabled || isEmpty(inputText)}
        warnText={warnText}
      />
      <Button
        className={cx(classes.sendButton, disabled ? classes.disabled : null)}
        renderIcon={ArrowRight}
        iconDescription="Submit"
        hasIconOnly
        disabled={disabled || isEmpty(inputText)}
        onClick={() => {
          onSubmit(inputText);
          setInputText('');
        }}
      />
    </div>
  );
}
