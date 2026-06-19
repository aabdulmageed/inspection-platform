{{/* Chart base name */}}
{{- define "ip.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Fully-qualified name = release name (resources are prefixed with it) */}}
{{- define "ip.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Common labels */}}
{{- define "ip.labels" -}}
app.kubernetes.io/name: {{ include "ip.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{/* Image ref: external registry (e.g. ACR) when set, else OpenShift internal */}}
{{- define "ip.image" -}}
{{- $name := index . 0 -}}{{- $ctx := index . 1 -}}
{{- if $ctx.Values.image.registry -}}
{{ $ctx.Values.image.registry }}/{{ $name }}:{{ $ctx.Values.build.tag }}
{{- else -}}
image-registry.openshift-image-registry.svc:5000/{{ $ctx.Release.Namespace }}/{{ $name }}:{{ $ctx.Values.build.tag }}
{{- end -}}
{{- end -}}

{{/* ImageStream-trigger annotation (OpenShift only) so Deployments roll out on rebuild */}}
{{- define "ip.trigger" -}}
{{- $name := index . 0 -}}{{- $ctx := index . 1 -}}
{{- if eq $ctx.Values.platform "openshift" -}}
image.openshift.io/triggers: |
  [{"from":{"kind":"ImageStreamTag","name":"{{ $name }}:{{ $ctx.Values.build.tag }}"},"fieldPath":"spec.template.spec.containers[?(@.name==\"{{ $name }}\")].image","pause":"false"}]
{{- end -}}
{{- end -}}

{{/* cert-manager annotations for Routes (openshift-routes integration) */}}
{{- define "ip.certManagerAnnotations" -}}
{{- if .Values.tls.certManager.enabled }}
cert-manager.io/issuer-name: {{ required "tls.certManager.issuerName is required when certManager is enabled" .Values.tls.certManager.issuerName | quote }}
cert-manager.io/issuer-kind: {{ .Values.tls.certManager.issuerKind | quote }}
cert-manager.io/issuer-group: cert-manager.io
{{- end }}
{{- end -}}

{{/* Public hostnames */}}
{{- define "ip.host.web" -}}
{{- if .Values.hosts.web }}{{ .Values.hosts.web }}{{ else }}{{ printf "%s.%s" .Values.hostPrefix (required "appsDomain or hosts.web is required" .Values.appsDomain) }}{{ end -}}
{{- end -}}

{{- define "ip.host.api" -}}
{{- if .Values.hosts.api }}{{ .Values.hosts.api }}{{ else }}{{ printf "%s-api.%s" .Values.hostPrefix (required "appsDomain or hosts.api is required" .Values.appsDomain) }}{{ end -}}
{{- end -}}

{{- define "ip.host.minio" -}}
{{- if .Values.hosts.minio }}{{ .Values.hosts.minio }}{{ else }}{{ printf "%s-minio.%s" .Values.hostPrefix (required "appsDomain or hosts.minio is required" .Values.appsDomain) }}{{ end -}}
{{- end -}}
