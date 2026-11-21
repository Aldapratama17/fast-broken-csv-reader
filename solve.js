/** Fast CSV parser matching csv-reader 1.0.0 behavior exactly. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  const len = text.length;
  
  // Drop BOM
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  function addError(code, extra = {}) {
    const err = { code, line: recordLine, row: recordRow };
    for (const k in extra) err[k] = extra[k];
    errors.push(err);
  }

  while (true) {
    // Skip empty lines (lines with no characters)
    while (pos < len) {
      const c = text[pos];
      if (c === '\n') {
        pos++;
        line++;
      } else if (c === '\r') {
        if (pos + 1 < len && text[pos + 1] === '\n') {
          pos += 2;
          line++;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let isQuoted = false;
    let fieldEnded = 2; // 0=COMMA, 1=LINE_BREAK, 2=END

    while (true) {
      isQuoted = text[pos] === '"';
      
      if (isQuoted) {
        // Parse quoted field
        const open = pos;
        const openLine = line;
        pos++; // skip opening quote
        let fieldStart = pos;
        let value = '';
        let closed = false;
        
        while (pos < len) {
          const c = text[pos];
          if (c === '"') {
            if (pos + 1 < len && text[pos + 1] === '"') {
              value += text.slice(fieldStart, pos) + '"';
              pos += 2;
              fieldStart = pos;
            } else {
              value += text.slice(fieldStart, pos);
              pos++;
              closed = true;
              break;
            }
          } else if (c === '\r') {
            value += text.slice(fieldStart, pos) + '\n';
            line++;
            if (pos + 1 < len && text[pos + 1] === '\n') {
              pos += 2;
            } else {
              pos += 1;
            }
            fieldStart = pos;
          } else if (c === '\n') {
            value += text.slice(fieldStart, pos) + '\n';
            pos++;
            line++;
            fieldStart = pos;
          } else {
            pos++;
          }
        }
        
        if (!closed) {
          // Unterminated quote - treat opening quote as literal, re-read as unquoted
          pos = open + 1;
          line = openLine;
          addError('unterminated_quote');
          
          // Parse as unquoted starting with the quote
          let uvalue = '"';
          fieldEnded = 2; // END
          while (pos < len) {
            const c = text[pos];
            if (c === ',') {
              pos++;
              fieldEnded = 0; // COMMA
              fields.push(uvalue);
              break;
            }
            if (c === '\n') {
              pos++;
              line++;
              fieldEnded = 1; // LINE_BREAK
              fields.push(uvalue);
              break;
            }
            if (c === '\r') {
              if (pos + 1 < len && text[pos + 1] === '\n') {
                pos += 2;
                line++;
                fieldEnded = 1; // LINE_BREAK
                fields.push(uvalue);
                break;
              }
              addError('stray_cr');
              pos++;
            } else {
              uvalue += c;
              pos++;
            }
          }
          if (fieldEnded === 2) {
            fields.push(uvalue);
          }
        } else {
          // Check for quote_junk after closing quote
          if (pos < len) {
            const c = text[pos];
            if (c !== ',' && c !== '\n' && !(c === '\r' && pos + 1 < len && text[pos + 1] === '\n')) {
              // Has junk - read it
              let junk = value;
              let junkAdded = 0;
              fieldEnded = 2; // END
              while (pos < len) {
                const c2 = text[pos];
                if (c2 === ',') {
                  pos++;
                  fieldEnded = 0; // COMMA
                  break;
                }
                if (c2 === '\n') {
                  pos++;
                  line++;
                  fieldEnded = 1; // LINE_BREAK
                  break;
                }
                if (c2 === '\r') {
                  if (pos + 1 < len && text[pos + 1] === '\n') {
                    pos += 2;
                    line++;
                    fieldEnded = 1; // LINE_BREAK
                    break;
                  }
                  addError('stray_cr');
                  pos++;
                } else {
                  junk += c2;
                  junkAdded++;
                  pos++;
                }
              }
              if (junkAdded > 0) {
                addError('quote_junk');
              }
              fields.push(junk);
            } else if (c === ',') {
              pos++;
              fields.push(value);
              fieldEnded = 0; // COMMA
            } else if (c === '\n') {
              pos++;
              line++;
              fields.push(value);
              fieldEnded = 1; // LINE_BREAK
            } else if (c === '\r' && pos + 1 < len && text[pos + 1] === '\n') {
              pos += 2;
              line++;
              fields.push(value);
              fieldEnded = 1; // LINE_BREAK
            } else {
              fields.push(value);
              fieldEnded = 2; // END
            }
          } else {
            fields.push(value);
            fieldEnded = 2; // END
          }
        }
      } else {
        // Fast path: unquoted field - scan for next delimiter
        let value = '';
        fieldEnded = 2; // END
        
        while (pos < len) {
          const c = text[pos];
          if (c === ',') {
            pos++;
            fieldEnded = 0; // COMMA
            fields.push(value);
            break;
          }
          if (c === '\n') {
            pos++;
            line++;
            fieldEnded = 1; // LINE_BREAK
            fields.push(value);
            break;
          }
          if (c === '\r') {
            if (pos + 1 < len && text[pos + 1] === '\n') {
              pos += 2;
              line++;
              fieldEnded = 1; // LINE_BREAK
              fields.push(value);
              break;
            }
            // stray CR - add error, skip CR, continue
            addError('stray_cr');
            pos++;
          } else {
            // Find run of normal characters
            let start = pos;
            while (pos < len) {
              const c2 = text[pos];
              if (c2 === ',' || c2 === '\n' || c2 === '\r') break;
              pos++;
            }
            if (start < pos) value += text.slice(start, pos);
          }
        }
        if (fieldEnded === 2) {
          fields.push(value);
        }
        if (pos >= len) {
          fieldEnded = 2; // END
          break;
        }
      }

      // Check if record continues (ended with comma)
      if (fieldEnded === 0) { // COMMA
        continue;
      }
      break;
    }

    // A line that held only stray CRs is left with no characters: no record
    if (fields.length === 1 && fields[0] === '' && !isQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      addError('short_row', { fields: fields.length });
      const needed = width - fields.length;
      for (let i = 0; i < needed; i++) fields.push('');
    } else if (fields.length > width) {
      const extra = fields.splice(width);
      addError('long_row', { extra });
    }
    rows.push(fields);
  }
  
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
