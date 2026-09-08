{{/*
Expand the name of the chart.
*/}}
{{- define "nexus-hems.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "nexus-hems.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "nexus-hems.labels" -}}
helm.sh/chart: {{ include "nexus-hems.name" . }}-{{ .Chart.Version }}
{{ include "nexus-hems.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "nexus-hems.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nexus-hems.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Validate image repositories against a trusted registry allowlist.
*/}}
{{- define "nexus-hems.assertTrustedImageRepository" -}}
{{- $repository := .repository -}}
{{- $trustedRegistries := .trustedRegistries | default (list) -}}
{{- $trusted := false -}}
{{- range $trustedRegistries -}}
	{{- if hasPrefix . $repository -}}
		{{- $trusted = true -}}
	{{- end -}}
{{- end -}}
{{- if not $trusted -}}
	{{- fail (printf "image repository %q must use one of the trusted registry prefixes: %s" $repository (join ", " $trustedRegistries)) -}}
{{- end -}}
{{- end }}

{{/*
Build a validated image reference.
*/}}
{{- define "nexus-hems.imageRef" -}}
{{- $image := .image -}}
{{- include "nexus-hems.assertTrustedImageRepository" (dict "repository" $image.repository "trustedRegistries" .trustedRegistries) -}}
{{- if $image.digest -}}
{{- printf "%s@%s" $image.repository $image.digest -}}
{{- else -}}
{{- printf "%s:%s" $image.repository ($image.tag | default .chartAppVersion) -}}
{{- end -}}
{{- end }}

{{/*
Frontend CSP connect-src WebSocket origins for docker-entrypoint.sh / nginx envsubst.
Defaults to wss://<ingress.host> when frontend.wsOrigins is empty.
*/}}
{{- define "nexus-hems.frontendWsOrigins" -}}
{{- if .Values.frontend.wsOrigins -}}
{{- .Values.frontend.wsOrigins -}}
{{- else if .Values.ingress.host -}}
{{- printf "wss://%s" .Values.ingress.host -}}
{{- else -}}
{{- fail "frontend.wsOrigins is empty and ingress.host is not set; provide one of them" -}}
{{- end -}}
{{- end }}
