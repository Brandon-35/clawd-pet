# clawd-pet for zsh: what Claude Code is doing, in your prompt.
#
# The clawd-pet mod writes one line per Claude Code session to ~/.cache/clawd-pet/sessions/<id>.tsv. This plugin
# reads those lines with zsh builtins only, so a prompt draw starts no process. It shows the session running in the
# current directory (or above it), and how many other sessions wait on you.
#
#   powerlevel10k: add `clawd_pet` to POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS (or the left ones).
#   other themes:  RPROMPT='$(clawd_pet_prompt_info)'
#   commands:      clawd-status lists live sessions; clawd-wait waits until the session here stops working.

zmodload zsh/datetime 2>/dev/null                 # EPOCHREALTIME
zmodload -F zsh/files b:zf_rm 2>/dev/null          # zf_rm, a builtin rm
zmodload -F zsh/zselect b:zselect 2>/dev/null      # zselect, a builtin sleep

typeset -g CLAWD_PET_DIR=${CLAWD_PET_DIR:-$HOME/.cache/clawd-pet/sessions}
typeset -g CLAWD_PET_ICON=${CLAWD_PET_ICON:-✻}
typeset -g CLAWD_PET_MAX=${CLAWD_PET_MAX:-28}    # the most characters of the status line the prompt shows

# Records a dead session left (no heartbeat for a day) go at load.
() {
  local f
  for f in $CLAWD_PET_DIR/*.tsv(N.mh+24); do zf_rm -f -- $f 2>/dev/null; done
}

# Reads the live records: the one for $PWD into reply (fields: format, mode, color, line, cwd, hp, mp, st,
# turn start, written), and the count of other sessions waiting on the user into _clawd_pet_waiting.
_clawd_pet_scan() {
  typeset -ga reply=()
  typeset -gi _clawd_pet_waiting=0
  local f line
  local -i best=0
  local -a r
  # A live session writes at least once a minute; three minutes of silence means it is gone.
  for f in $CLAWD_PET_DIR/*.tsv(N.mm-3); do
    IFS= read -r line < $f || continue
    r=("${(@ps:\t:)line}")
    [[ $r[1] == 1 && $r[2] != ended ]] || continue
    if [[ ( $PWD == $r[5] || $PWD == $r[5]/* ) ]] && (( ${#r[5]} > best )); then
      (( best )) && [[ $reply[2] == alert ]] && (( _clawd_pet_waiting++ ))
      best=${#r[5]}
      reply=("${r[@]}")
    elif [[ $r[2] == alert ]]; then
      (( _clawd_pet_waiting++ ))
    fi
  done
}

# A duration in seconds as `42s`, `3m05s`, `1h02m`, into REPLY.
_clawd_pet_dur() {
  local -i s=$1
  if (( s >= 3600 )); then REPLY="$(( s / 3600 ))h${(l:2::0:)$(( s % 3600 / 60 ))}m"
  elif (( s >= 60 )); then REPLY="$(( s / 60 ))m${(l:2::0:)$(( s % 60 ))}s"
  else REPLY="${s}s"; fi
}

# The segment's text and color into REPLY and _clawd_pet_color; REPLY is empty when there is nothing to show.
_clawd_pet_build() {
  _clawd_pet_scan
  local text='' line
  typeset -g _clawd_pet_color=''
  if (( $#reply )); then
    # An idle pet's lines are small talk; the prompt only needs to know the session is free.
    case $reply[2] in
      idle) line='ready' ;;
      sleep) line='asleep' ;;
      *) line=$reply[4] ;;
    esac
    (( $#line > CLAWD_PET_MAX )) && line="${line[1,CLAWD_PET_MAX-1]}…"
    text="$CLAWD_PET_ICON $line"
    if [[ -n $reply[9] && $reply[2] != (idle|sleep|cheer|error|abort|jump) ]]; then
      _clawd_pet_dur $(( (EPOCHREALTIME * 1000 - reply[9]) / 1000 ))
      text+=" · $REPLY"
    fi
    [[ -n $reply[6] ]] && text+=" · HP $reply[6]%"
    _clawd_pet_color=$reply[3]
  fi
  if (( _clawd_pet_waiting )); then
    text+="${text:+  }$CLAWD_PET_ICON $_clawd_pet_waiting waiting"
    [[ -z $_clawd_pet_color ]] && _clawd_pet_color='#d68a1a'
  fi
  REPLY=$text
}

# powerlevel10k segment `clawd_pet`.
prompt_clawd_pet() {
  _clawd_pet_build
  [[ -n $REPLY ]] && p10k segment -f "${_clawd_pet_color:-#c9744f}" -t "${REPLY//\%/%%}"
}
# Instant prompt draws from the same records, which are on disk before zsh starts.
instant_prompt_clawd_pet() { prompt_clawd_pet }

# For any other theme: RPROMPT='$(clawd_pet_prompt_info)'.
clawd_pet_prompt_info() {
  _clawd_pet_build
  [[ -n $REPLY ]] && print -rn -- "%F{${_clawd_pet_color:-#c9744f}}${REPLY//\%/%%}%f"
}

# Lists every live session: mode, directory, status line, HP and MP.
clawd-status() {
  local f line
  local -a r
  local -i n=0
  for f in $CLAWD_PET_DIR/*.tsv(N.mm-3); do
    IFS= read -r line < $f || continue
    r=("${(@ps:\t:)line}")
    [[ $r[1] == 1 && $r[2] != ended ]] || continue
    (( n++ ))
    print -P -- "%F{$r[3]}${(r:8:)r[2]}%f ${(D)r[5]}  ${r[4]//\%/%%}${r[6]:+  HP $r[6]%%}${r[7]:+  MP $r[7]%%}"
  done
  (( n )) || print -- 'no Claude Code session is running'
}

# Waits until the session for this directory stops working (done, stopped, failed, or waiting on you), then rings
# the bell and prints how it ended. Chains like `clawd-wait && git push`; returns 1 when it ended badly or no
# session runs here.
clawd-wait() {
  _clawd_pet_scan
  if (( ! $#reply )); then print -u2 -- 'clawd-wait: no Claude Code session runs here'; return 1; fi
  while [[ $reply[2] != (idle|sleep|cheer|error|abort|alert) ]]; do
    zselect -t 100 2>/dev/null  # times out after 1 s, which is the point
    _clawd_pet_scan
    (( $#reply )) || { print -u2 -- 'clawd-wait: the session ended'; return 1; }
  done
  print -n -- '\a'
  print -- "clawd: $reply[2] · $reply[4]"
  [[ $reply[2] == (idle|sleep|cheer|alert) ]]
}
