package parsing

import "strings"

func ParseStringArrayField(input string) string {
	// Clean up the JSON string
	cleaned := strings.Trim(input, "[]\"")

	parts := strings.Split(cleaned, `","`)

	result := make([]string, len(parts))

	for i, part := range parts {
		result[i] = strings.ReplaceAll(part, `""`, `"`)
	}

	return strings.Join(result, ";")
}
