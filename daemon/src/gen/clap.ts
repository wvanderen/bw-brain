/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

export type ClapIdentityMessage =
  | {
      type: "link.confirm.request";
    }
  | {
      type: "link.confirm.pending";
      nonce: string;
      scope: {
        projectId: string;
        instanceId: string;
        trackSid: string;
        trackSlot: number;
        clipSid?: string;
        trackHint?: string;
        deviceHint?: string | null;
      };
    }
  | {
      type: "link.confirm.accept";
      nonce: string;
    }
  | {
      type: "link.status";
      status: "confirmed" | "stale" | "unlinked";
      scope: {
        projectId: string;
        instanceId: string;
        trackSid: string;
        trackSlot: number;
        clipSid?: string;
        trackHint?: string;
        deviceHint?: string | null;
      };
    }
  | {
      type: "focus.set";
      scope: {
        projectId: string;
        instanceId: string;
        clipSid?: string;
      };
    }
  | {
      type: "focus.status";
      scope: {
        projectId: string;
        instanceId: string;
        clipSid?: string;
      };
    }
  | {
      type: "session.fork.request";
      sourceProjectId: string;
      newProjectId: string;
    }
  | {
      type: "session.fork.confirmation_required";
      token: string;
      sourceProjectId: string;
      newProjectId: string;
      /**
       * @maxItems 32
       */
      instanceIds: string[];
    }
  | {
      type: "session.fork.confirm";
      token: string;
      sourceProjectId: string;
      newProjectId: string;
    }
  | {
      type: "ProjectForkCommitted";
      sourceProjectId: string;
      newProjectId: string;
      /**
       * @maxItems 32
       */
      instanceIds: string[];
      lineageVersion: number;
    }
  | {
      type: "action.error";
      error: string;
    };

/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

export type ClapPeerMessage =
  | {
      type: "clap.hello";
      protocol: "1.0";
      instanceId: string;
      /**
       * @maxItems 16
       */
      capabilities:
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string, string, string, string]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ];
      limits: {
        maxLineBytes: number;
        maxQueueMessages: number;
        maxQueueBytes: number;
      };
    }
  | {
      type: "clap.accept";
      connectionId: string;
      instanceId: string;
    }
  | {
      type: "instance.rekey";
      oldInstanceId: string;
      newInstanceId: string;
      reason: "simultaneous_claim" | "project_fork";
    }
  | {
      type: "peer.health";
      sequence: number;
      droppedSnapshots: number;
    }
  | {
      type: "stop";
      projectId: string;
      reason: "user" | "disconnect" | "shutdown";
    };

/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

export type ClapPhraseMessage =
  | {
      type: "phrase.arm";
      armToken: string;
      proposalId: string;
      revision: number;
      phraseId: string;
      scope: {
        projectId: string;
        instanceId: string;
        clipSid: string;
      };
      launch: "next_beat" | "next_bar";
      lengthBeats: number;
      /**
       * @minItems 1
       * @maxItems 16
       */
      notes:
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ]
        | [
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            },
            {
              ordinal: number;
              startBeats: number;
              durationBeats: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              noteId: number;
            }
          ];
    }
  | {
      type: "phrase.disarm";
      phraseId: string;
      reason: "user" | "stop" | "disconnect" | "rekey" | "fork" | "output_failure";
    }
  | {
      type: "phrase.status";
      phraseId: string;
      status: "armed" | "waiting_for_transport" | "playing" | "complete" | "disarmed" | "cleanup_pending";
      samplesUntilLaunch?: number;
    };

/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

export type ClapProposalMessage =
  | {
      type: "proposal.publish";
      proposalId: string;
      revision: number;
      digest: string;
      kind: "existing_edit" | "live_midi";
      scope: {
        projectId: string;
        instanceId: string;
        clipSid?: string;
      };
      rationale: string;
      /**
       * @maxItems 8
       */
      assumptions:
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string];
      material:
        | {
            patchId: string;
          }
        | {
            phraseId: string;
            launch: "next_beat" | "next_bar";
            lengthBeats: number;
            /**
             * @minItems 1
             * @maxItems 16
             */
            notes:
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ]
              | [
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  },
                  {
                    ordinal: number;
                    startBeats: number;
                    durationBeats: number;
                    port: number;
                    channel: number;
                    key: number;
                    velocity: number;
                    noteId: number;
                  }
                ];
          };
    }
  | {
      type: "proposal.inspect";
      proposalId: string;
      revision: number;
      scope: {
        projectId: string;
        instanceId: string;
        clipSid?: string;
      };
    }
  | {
      type: "proposal.approval.request";
      proposalId: string;
      revision: number;
      scope: {
        projectId: string;
        instanceId: string;
        clipSid?: string;
      };
    }
  | {
      type: "approval.issue";
      token: string;
      proposalId: string;
      revision: number;
      scope: {
        projectId: string;
        instanceId: string;
        clipSid?: string;
      };
      digest: string;
      expiresAt: number;
    }
  | {
      type: "approval.consume";
      token: string;
      proposalId: string;
      revision: number;
      scope: {
        projectId: string;
        instanceId: string;
        clipSid?: string;
      };
      digest: string;
    }
  | {
      type: "approval.result";
      proposalId: string;
      ok: boolean;
      error?: "expired" | "consumed" | "scope_mismatch" | "revision_mismatch" | "disconnected" | "stopped";
    };

/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

export type ClapTelemetryMessage =
  | {
      type: "telemetry.snapshot";
      projectId: string;
      instanceId: string;
      sequence: number;
      droppedSnapshots: number;
      aggregate: {
        /**
         * @minItems 1
         * @maxItems 2
         */
        rms: [number] | [number, number];
        /**
         * @minItems 1
         * @maxItems 2
         */
        peak: [number] | [number, number];
        noteDensity: number;
        /**
         * @minItems 12
         * @maxItems 12
         */
        pitchClass: [number, number, number, number, number, number, number, number, number, number, number, number];
        /**
         * @minItems 8
         * @maxItems 8
         */
        velocityBins: [number, number, number, number, number, number, number, number];
        /**
         * @minItems 16
         * @maxItems 16
         */
        rhythmBins: [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number
        ];
        transport: {
          playing: boolean;
          tempo: number;
          numerator: number;
          denominator: 1 | 2 | 4 | 8 | 16 | 32;
        };
      };
      /**
       * @maxItems 16
       */
      recentNotes:
        | []
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ]
        | [
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            },
            {
              offset: number;
              port: number;
              channel: number;
              key: number;
              velocity: number;
              kind: "on" | "off";
            }
          ];
    }
  | {
      type: "analysis.request";
      requestId: string;
      scope: {
        projectId: string;
        instanceId: string;
        clipSid?: string;
      };
      prompt?: string;
    }
  | {
      type: "analysis.status";
      requestId: string;
      status: "running";
      scope: {
        projectId: string;
        instanceId: string;
        clipSid?: string;
      };
    }
  | {
      type: "conversation.chunk";
      requestId: string;
      sequence: number;
      text: string;
    }
  | {
      type: "analysis.complete";
      requestId: string;
      status: "ok" | "aborted" | "error";
      error?:
        | "analysis_auth_required"
        | "analysis_model_unavailable"
        | "analysis_proposal_required"
        | "analysis_failed";
    }
  | {
      type: "arrangement.review";
      requestId: string;
      scope: {
        projectId: string;
        instanceId: string;
        clipSid?: string;
      };
      refresh?: boolean;
    }
  | {
      type: "device.review";
      requestId: string;
      scope: {
        projectId: string;
        instanceId: string;
        clipSid?: string;
      };
      refresh?: boolean;
    };
