
#include "gm_plugin.h"

/*
 Remote Display Demo v1.3

 Build path verification only.

 This version intentionally fails plugin loading.
 Purpose:
 Confirm that Studio is actually using this folder/package.
*/

gm_plugin_result_t gm_plugin_entry(
    const gm_plugin_host_api_t *host,
    gm_plugin_descriptor_t *plugin)
{
    (void)host;
    (void)plugin;

    return GM_PLUGIN_EINVAL;
}
