"use client";

import * as React from "react";
import { Building2, Landmark, ShieldCheck, Store } from "lucide-react";

import { PageHeader, Section } from "@/components/data/section";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/data/states";
import { StatusBadge } from "@/components/data/status";
import { Mono, Row, Rows } from "@/components/data/value";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { count, dateOf, percent, ppmToBps, shortId } from "@/lib/format";
import { useMe, usePolicyParameters, useVendors } from "@/lib/queries";

/**
 * Settings — the workspace, the policy the engines run with, and the vendor
 * registry. Read-only by design: policy values are versioned configuration
 * changed through code review, not a form. Showing them here is observability;
 * editing them here would be a bypass.
 */

export default function SettingsPage() {
  const me = useMe();
  const policy = usePolicyParameters();
  const vendors = useVendors();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Workspace identity, the policy parameters in force, and the vendor registry."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-2.5">
              <Building2 className="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <CardTitle>Workspace</CardTitle>
                <p className="mt-0.5 text-xs text-muted">
                  A sandbox workspace provisioned for this browser session. All data in it is
                  yours alone.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {me.isPending ? (
              <LoadingBlock />
            ) : me.isError ? (
              <ErrorState detail={me.error.message} onRetry={() => void me.refetch()} />
            ) : (
              <Rows>
                <Row label="Name">{me.data.name}</Row>
                <Row label="Workspace id">
                  <Mono>{shortId(me.data.organization_id, 14, 6)}</Mono>
                </Row>
                <Row label="Status">
                  <StatusBadge status={me.data.status} />
                </Row>
                <Row label="Signed in as">{me.data.user.email}</Row>
                <Row label="Role">
                  <Badge tone="info" size="sm">
                    {me.data.user.role}
                  </Badge>
                </Row>
                <Row label="Created">{dateOf(me.data.created_at)}</Row>
              </Rows>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <CardTitle>Environment</CardTitle>
                <p className="mt-0.5 text-xs text-muted">
                  Read live from the service, not restated by the page.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {policy.isPending ? (
              <LoadingBlock />
            ) : policy.isError ? (
              <ErrorState detail={policy.error.message} onRetry={() => void policy.refetch()} />
            ) : (
              <Rows>
                <Row label="Run mode">{policy.data.environment.run_mode}</Row>
                <Row label="Environment">{policy.data.environment.environment}</Row>
                <Row label="Model provider" hint="All model inference is local. No external LLM API is called at runtime.">
                  {policy.data.environment.model_provider}
                </Row>
                <Row label="Voice provider">{policy.data.environment.voice_provider}</Row>
                <Row label="Test credits only">
                  {policy.data.environment.test_credits_only ? (
                    <span className="text-positive">Yes — no real money moves</span>
                  ) : (
                    <span className="text-critical">No</span>
                  )}
                </Row>
              </Rows>
            )}
          </CardContent>
        </Card>
      </div>

      <Section
        title="Credit policy in force"
        description="Versioned configuration the deterministic engine runs with. Changed through code review, never through this page."
      >
        <Card>
          <CardHeader>
            <div className="flex items-start gap-2.5">
              <Landmark className="mt-0.5 size-4 shrink-0 text-muted" />
              <CardTitle>Parameters</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {policy.isPending ? (
              <LoadingBlock lines={6} />
            ) : policy.isError ? (
              <ErrorState detail={policy.error.message} onRetry={() => void policy.refetch()} />
            ) : (
              <div className="grid gap-x-8 md:grid-cols-2">
                <Rows>
                  <Row label="Advance rate" hint="The share of expected task revenue that can be advanced as credit.">
                    {percent(policy.data.credit_policy.advance_rate_ppm)}
                  </Row>
                  <Row label="Loss given default (assumed)">
                    {percent(policy.data.credit_policy.lgd_ppm_default)}
                  </Row>
                  <Row label="Auto-approve ceiling — PD">
                    {percent(policy.data.credit_policy.auto_approve_max_pd_ppm, 2)}
                  </Row>
                  <Row label="Auto-approve ceiling — expected-loss ratio">
                    {percent(policy.data.credit_policy.auto_approve_max_el_ratio_ppm, 2)}
                  </Row>
                  <Row label="Credit fee">{ppmToBps(policy.data.credit_policy.fee_rate_ppm)}</Row>
                </Rows>
                <Rows>
                  <Row label="Decision engine version">
                    <Mono>{policy.data.credit_policy.decision_version}</Mono>
                  </Row>
                  <Row label="Scorecard version">
                    <Mono>{policy.data.credit_policy.scorecard_version}</Mono>
                  </Row>
                  <Row label="Active vault controls">
                    <span className="tnum">{count(policy.data.risk_policy.active_controls)}</span>
                  </Row>
                  <Row label="Velocity rule">
                    <span className="tnum">
                      max {policy.data.risk_policy.velocity_max_transactions} txns per{" "}
                      {policy.data.risk_policy.velocity_window_seconds / 60} min
                    </span>
                  </Row>
                  <Row label="Anti-splitting">{policy.data.risk_policy.anti_splitting}</Row>
                </Rows>
                <p className="mt-3 border-t border-line-soft pt-3 text-xs leading-relaxed text-muted md:col-span-2">
                  Approved limit ={" "}
                  <Mono>{policy.data.credit_policy.limit_formula}</Mono>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Vendor registry"
        description="Vendors known to the platform. A vault can only ever pay a subset of this list, bound per vault at approval time."
      >
        <Card>
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow className="border-t-0">
                  <TableHead>Vendor</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.isPending ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <LoadingBlock lines={3} />
                    </TableCell>
                  </TableRow>
                ) : vendors.isError ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <ErrorState
                        detail={vendors.error.message}
                        onRetry={() => void vendors.refetch()}
                      />
                    </TableCell>
                  </TableRow>
                ) : vendors.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <EmptyState
                        icon={Store}
                        title="No vendors registered"
                        body="Scenario runs register the vendors they need."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  vendors.data.map((vendor) => (
                    <TableRow key={vendor.vendor_id}>
                      <TableCell className="text-sm font-medium text-ink">{vendor.name}</TableCell>
                      <TableCell>
                        <Badge tone="outline" size="sm">
                          {vendor.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={vendor.status} />
                      </TableCell>
                      <TableCell>
                        <Mono>{shortId(vendor.vendor_id, 12, 4)}</Mono>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableWrap>
        </Card>
      </Section>
    </div>
  );
}
